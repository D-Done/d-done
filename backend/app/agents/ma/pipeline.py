"""M&A v1 non-RAG pipeline orchestrator.

Structure (mirrors the finance ``visual_grounding_pipeline``):

    SequentialAgent(ma_pipeline)
        ma_doc_classifier (Flash)            # classify + multi-label tag
        ParallelAgent(ma_chapter_extraction) # 10 chapter agents (Pro)
        ma_completeness                      # aggregates follow_ups
        (after_agent_callback)               # assemble MaDDReport

The final ``MaDDReport`` is stitched together by an ``after_agent_callback``
attached to the sequential agent itself — the callback reads every chapter's
state key, converts ``box_2d`` -> ``bounding_boxes`` (reusing the finance
converter), and writes the report to ``STATE_ENRICHED_REPORT`` so the
existing analysis endpoint picks it up with no branching.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.llm_agent import LlmAgent  # re-export for typing clarity
from google.adk.agents.parallel_agent import ParallelAgent
from google.adk.agents.sequential_agent import SequentialAgent
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from app.agents.constants import (
    STATE_DOCUMENT_NAMES,
    STATE_ENRICHED_REPORT,
    STATE_TEXT_PARTS,
)
from app.agents.ma.chapter_agents import create_ma_chapter_agents
from app.agents.ma.classifier import create_ma_classifier_agent
from app.agents.ma.completeness import create_ma_completeness_agent
from app.agents.visual_grounding_pipeline_agent import _repair_truncated_json
from app.agents.ma.constants import (
    CHAPTER_TITLES_HE,
    MA_MANDATORY_CHAPTERS,
    STATE_MA_COMPLETENESS,
    STATE_MA_METADATA,
    chapter_state_key,
)
from app.agents.ma.report_schema import (
    MaDDReport,
    MaProjectHeader,
    MaProjectMetadata,
)
from app.agents.schemas import ExecutiveSummary, TransactionType
from app.agents.visual_grounding_synthesis import _convert_box2d_to_bboxes

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Classifier PDF injector — identical to the finance one, except we also
# attach the M&A-specific filename manifest the classifier's prompt expects.
# ---------------------------------------------------------------------------


def _inject_pdfs_for_ma_classifier(
    callback_context: CallbackContext, llm_request: LlmRequest
) -> None:
    """Attach document metadata to the classifier request.

    The classifier only needs filenames (and brief text snippets for
    text-extracted files) to tag documents to chapters.  Sending all PDFs
    as file-data parts causes the 1 M-token Flash context window to overflow
    when a project has hundreds of documents, so we deliberately omit them
    here.  Chapter agents receive the actual PDF content after classification.
    """
    doc_names: list[str] = callback_context.state.get(STATE_DOCUMENT_NAMES, [])
    text_parts: dict[str, str] = callback_context.state.get(STATE_TEXT_PARTS, {})

    # Build manifest covering ALL files (PDFs + text-extracted).
    all_names = list(doc_names) + list(text_parts.keys())
    numbered = "\n".join(f"{i + 1}. {n}" for i, n in enumerate(all_names))
    manifest = (
        f"## Documents ({len(all_names)}) — VALID FILENAMES\n\n"
        + numbered
        + "\n\nUse each filename EXACTLY as shown when populating ``filename``."
    )

    parts: list[types.Part] = []
    # Short text snippets for text-extracted files (Excel, Word, etc.).
    # PDFs are intentionally skipped — filenames alone are sufficient for
    # classification and keeping them out prevents context-window overflow.
    for filename, text in text_parts.items():
        snippet = text[:1_500].rstrip()
        parts.append(
            types.Part.from_text(
                text=f"[Document: {filename}]\n{snippet}\n... [truncated for classification] ..."
            )
        )

    parts.append(types.Part.from_text(text=manifest))
    llm_request.contents.insert(0, types.Content(role="user", parts=parts))
    logger.info(
        "ma_classifier: injected manifest (%d filenames) + %d text snippet(s); PDFs classified by filename only",
        len(all_names),
        len(text_parts),
    )
    return None


# ---------------------------------------------------------------------------
# Executive-summary synthesiser — deterministic, no LLM call required.
# ---------------------------------------------------------------------------


def _build_executive_summary(chapters: list[dict]) -> ExecutiveSummary:
    """Roll per-chapter summaries into a single report-level summary.

    We deliberately do NOT call an LLM for this — deterministic stitching
    gives lawyers reproducible output and keeps latency/cost low. The
    risk_level is the max severity seen across findings; the Hebrew summary
    concatenates each chapter's summary_he under a short heading.
    """
    severity_rank = {"critical": 3, "warning": 2, "info": 1}
    max_rank = 0
    parts: list[str] = []
    for chapter in chapters:
        chapter_id = chapter.get("chapter_id")
        title = chapter.get("chapter_title_he") or CHAPTER_TITLES_HE.get(
            chapter_id, chapter_id
        )
        summary = (chapter.get("summary_he") or "").strip()
        if summary:
            parts.append(f"{title}: {summary}")
        for finding in chapter.get("findings") or []:
            rank = severity_rank.get(finding.get("severity") or "info", 1)
            if rank > max_rank:
                max_rank = rank

    risk_level = "low"
    if max_rank >= 3:
        risk_level = "high"
    elif max_rank >= 2:
        risk_level = "medium"

    narrative = "\n\n".join(parts) if parts else "לא נמצאו ממצאים מהותיים."
    return ExecutiveSummary(risk_level=risk_level, summary=narrative)


# ---------------------------------------------------------------------------
# After-agent callback — assembles the full MaDDReport.
# ---------------------------------------------------------------------------


async def _assemble_ma_report(callback_context: CallbackContext) -> None:
    """Read every chapter + completeness from state and build ``MaDDReport``.

    Runs as the SequentialAgent's ``after_agent_callback`` — at this point
    all chapter agents and the completeness agent have written their outputs.
    """
    chapters: list[dict] = []
    for chapter_id in MA_MANDATORY_CHAPTERS:
        chapter_dict = callback_context.state.get(chapter_state_key(chapter_id))
        if not chapter_dict:
            logger.warning(
                "ma_pipeline: chapter %s produced no output; inserting empty_state",
                chapter_id,
            )
            chapter_dict = {
                "chapter_id": chapter_id,
                "chapter_title_he": CHAPTER_TITLES_HE[chapter_id],
                "summary_he": "הפרק לא הופק — ייתכן שלא סופקו מסמכים רלוונטיים.",
                "empty_state": True,
                "findings": [],
                "follow_ups": [],
                "timeline_events": [],
            }
        chapters.append(chapter_dict)

    completeness = callback_context.state.get(STATE_MA_COMPLETENESS) or {
        "items": [],
        "summary_he": None,
    }

    metadata_raw = callback_context.state.get(STATE_MA_METADATA) or {}
    metadata: MaProjectMetadata | None = None
    try:
        if metadata_raw:
            metadata = MaProjectMetadata.model_validate(metadata_raw)
    except Exception:
        logger.warning("ma_pipeline: failed to parse MaProjectMetadata", exc_info=True)
        metadata = None

    doc_names: list[str] = callback_context.state.get(STATE_DOCUMENT_NAMES, []) or []

    project_header = MaProjectHeader(
        project_name=getattr(metadata, "project_name", None),
        client_name=getattr(metadata, "client_name", None),
        representing_role=getattr(metadata, "representing_role", None),
        counterparty_name=getattr(metadata, "counterparty_name", None),
        status="completed",
        created_at=datetime.now(timezone.utc).isoformat(),
        doc_count=len(doc_names),
    )

    executive_summary = _build_executive_summary(chapters)

    report = {
        "transaction_type": TransactionType.MA.value,
        "project_header": project_header.model_dump(),
        "executive_summary": executive_summary.model_dump(),
        "chapters": chapters,
        "completeness": completeness,
    }

    report = _convert_box2d_to_bboxes(report)
    report["_visual_grounding"] = True

    # Round-trip through the pydantic model so the DB sees only validated shape.
    try:
        validated = MaDDReport.model_validate(report)
        report = validated.model_dump(mode="json")
        report["_visual_grounding"] = True
    except Exception:
        logger.warning(
            "ma_pipeline: MaDDReport validation failed; storing raw dict",
            exc_info=True,
        )

    callback_context.state["ma_dd_report"] = report
    callback_context.state[STATE_ENRICHED_REPORT] = report
    return None


# ---------------------------------------------------------------------------
# Public factory
# ---------------------------------------------------------------------------


def create_ma_pipeline() -> SequentialAgent:
    """Assemble the M&A v1 sequential pipeline.

    ``after_agent_callback`` on the outer SequentialAgent runs after every
    sub-agent has finished, so the assembler sees all chapter + completeness
    state at once.
    """
    classifier = create_ma_classifier_agent()
    classifier.before_model_callback = _inject_pdfs_for_ma_classifier
    classifier.after_model_callback = _repair_truncated_json

    chapter_agents = create_ma_chapter_agents()
    completeness = create_ma_completeness_agent()

    return SequentialAgent(
        name="ma_pipeline",
        sub_agents=[
            classifier,
            ParallelAgent(
                name="ma_chapter_extraction",
                sub_agents=chapter_agents,
            ),
            completeness,
        ],
        after_agent_callback=_assemble_ma_report,
    )


__all__ = ["create_ma_pipeline"]
