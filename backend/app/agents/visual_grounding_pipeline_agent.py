"""Visual Grounding DD pipeline -- Gemini 3.1 Pro with native bounding boxes.

Alternative to the standard finance pipeline. Instead of:
  DocAI OCR -> Gemini (text) -> citation resolver (post-hoc fuzzy matching)

This pipeline uses:
  Gemini 3.1 Pro (reads PDFs natively via Part.from_uri)
  -> returns verbatim_quote WITH box_2d bounding boxes
  -> bounding_boxes filled directly from the model (no post-processing)
"""

from __future__ import annotations

import json
import logging

import json_repair
from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.context_cache_config import ContextCacheConfig
from google.adk.apps.app import App
from google.adk.agents.parallel_agent import ParallelAgent
from google.adk.agents.sequential_agent import SequentialAgent
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from app.agents.constants import (
    EXTRACTOR_DOC_TYPES,
    STATE_DOC_CLASSIFICATION,
    STATE_DOCUMENT_NAMES,
    STATE_GCS_URIS,
)
from app.agents.utils import make_generate_config

logger = logging.getLogger(__name__)

GEMINI_31_PRO = "gemini-3.1-pro-preview"
VG_MAX_OUTPUT_TOKENS = 65_536  # Max for all extractors — avoids truncation on large docs


def _build_manifest(doc_names: list[str]) -> str:
    numbered = "\n".join(f"{i + 1}. {name}" for i, name in enumerate(doc_names))
    return (
        f"## Documents ({len(doc_names)})\n\n"
        + numbered
        + "\n\nCRITICAL: When populating `source_document_name`, "
        "you MUST copy the filename EXACTLY as it appears in this list."
    )


VG_INSTRUCTION = (
    "VISUAL GROUNDING (MANDATORY for every evidentiary reference):\n\n"
    "The `box_2d` field IS the citation. It is the primary mechanism for "
    "proving where evidence appears in the document. Lawyers will rely on "
    "the highlighted region to verify your claims — accuracy is critical.\n\n"
    "box_2d rules:\n"
    "- Format: [y_min, x_min, y_max, x_max], each integer 0-1000.\n"
    "- The box must tightly wrap the relevant text region on the page.\n"
    "- If the evidence spans multiple lines, the box covers all of them.\n"
    "- Be spatially precise — use Pixel-Precise Pointing.\n"
    "- NEVER omit box_2d. Every source reference MUST have it.\n"
    "- One box per reference. Evidence on different pages = separate references.\n\n"
    "page_number rules:\n"
    "- Use the 1-indexed page number within the SPECIFIC PDF document where the evidence appears.\n"
    "- If multiple PDFs are provided, each document's pages are numbered INDEPENDENTLY starting from 1.\n"
    "- NEVER use global/cumulative page numbers across multiple PDFs.\n"
    "- Example: if PDF-A has 20 pages and the evidence is on page 3 of PDF-B, report page_number=3, NOT 23.\n\n"
    "verbatim_quote rules:\n"
    "- A short human-readable label describing the evidence the box points to.\n"
    "- Keep it concise — a key phrase or short sentence in Hebrew.\n"
    "- It does NOT need to be a character-perfect copy; the box is the proof.\n"
)


def _repair_truncated_json(
    callback_context: CallbackContext, llm_response: LlmResponse
) -> LlmResponse | None:
    """After-model callback: repair truncated JSON from Gemini 3.1 Pro.

    The model sometimes produces cut-off JSON when output tokens are exhausted.
    We use json_repair to fix it before ADK tries to validate against the schema.
    """
    if llm_response is None or llm_response.content is None:
        return None
    parts = llm_response.content.parts or []
    if not parts:
        return None
    text = parts[0].text if parts[0].text else None
    if not text or not text.strip():
        return None
    stripped = text.strip()
    if not stripped.startswith("{"):
        return None
    try:
        json.loads(stripped)
        return None
    except json.JSONDecodeError:
        pass
    try:
        repaired = json_repair.repair_json(stripped, return_objects=False)
        if repaired and repaired != stripped:
            logger.warning(
                "Repaired truncated JSON from VG extractor (%d -> %d chars)",
                len(stripped),
                len(repaired),
            )
            new_parts = [types.Part.from_text(text=repaired)] + list(parts[1:])
            return LlmResponse(
                content=types.Content(role="model", parts=new_parts)
            )
    except Exception:
        logger.exception("JSON repair failed")
    return None


def _inject_pdfs_for_classifier(
    callback_context: CallbackContext, llm_request: LlmRequest
) -> None:
    """Inject all project PDFs into the classifier request."""
    gcs_uris: list[str] = callback_context.state.get(STATE_GCS_URIS, [])
    doc_names: list[str] = callback_context.state.get(STATE_DOCUMENT_NAMES, [])
    if not gcs_uris:
        return None
    parts: list[types.Part] = [
        types.Part.from_uri(file_uri=uri, mime_type="application/pdf")
        for uri in gcs_uris
    ]
    parts.append(types.Part.from_text(text=_build_manifest(doc_names)))
    llm_request.contents.insert(0, types.Content(role="user", parts=parts))
    return None


def _make_inject_pdfs_filtered(accepted_types: list[str], empty_json: str):
    """Return a before_model_callback that injects matching PDFs + visual grounding instruction."""

    def _callback(
        callback_context: CallbackContext, llm_request: LlmRequest
    ) -> LlmResponse | None:
        classification_result: dict = (
            callback_context.state.get(STATE_DOC_CLASSIFICATION) or {}
        )
        classifications: dict[str, str] = classification_result.get(
            "classifications", {}
        )
        all_uris: list[str] = callback_context.state.get(STATE_GCS_URIS, [])
        all_names: list[str] = callback_context.state.get(STATE_DOCUMENT_NAMES, [])

        matched_pairs = [
            (uri, name)
            for uri, name in zip(all_uris, all_names)
            if classifications.get(name) in accepted_types
        ]

        if not matched_pairs:
            return LlmResponse(
                content=types.Content(
                    role="model",
                    parts=[types.Part.from_text(text=empty_json)],
                )
            )

        parts: list[types.Part] = [
            types.Part.from_uri(file_uri=uri, mime_type="application/pdf")
            for uri, _ in matched_pairs
        ]
        parts.append(types.Part.from_text(text=_build_manifest(all_names)))
        parts.append(types.Part.from_text(text=VG_INSTRUCTION))
        llm_request.contents.insert(0, types.Content(role="user", parts=parts))
        return None

    return _callback


def create_visual_grounding_pipeline() -> SequentialAgent:
    """Assemble the visual grounding DD pipeline.

    Structure:
        ClassifierAgent (Flash)
        -> ParallelAgent(extractors using Gemini 3.1 Pro, no DocAI)
        -> SequentialAgent(synthesis with visual grounding)
    """
    from app.agents.doc_classifier_agent import create_classifier_agent

    from app.agents.extractors.company_docs.agent import create_agent as company_docs
    from app.agents.extractors.credit_committee.agent import (
        create_agent as credit_committee,
    )
    from app.agents.extractors.planning_permit.agent import (
        create_agent as planning_permit,
    )
    from app.agents.extractors.pledges_registry.agent import (
        create_agent as pledges_registry,
    )
    from app.agents.extractors.project_agreement.agent import (
        create_agent as agreement,
    )
    from app.agents.extractors.project_agreement_additions.agent import (
        create_agent as agreement_additions,
    )
    from app.agents.extractors.signing_protocol.agent import (
        create_agent as signing_protocol,
    )
    from app.agents.extractors.tabu.agent import create_agent as tabu
    from app.agents.extractors.zero_report.agent import create_agent as zero_report

    extractors = [
        tabu(),
        zero_report(),
        agreement(),
        agreement_additions(),
        credit_committee(),
        company_docs(),
        signing_protocol(),
        planning_permit(),
        pledges_registry(),
    ]

    vg_config = make_generate_config(max_output_tokens=VG_MAX_OUTPUT_TOKENS)

    for ext in extractors:
        ext.model = GEMINI_31_PRO
        if vg_config is not None:
            ext.generate_content_config = vg_config
        ext.after_model_callback = _repair_truncated_json
        accepted = EXTRACTOR_DOC_TYPES.get(ext.name, [])
        empty_json = ext.output_schema().model_dump_json()
        ext.before_model_callback = _make_inject_pdfs_filtered(accepted, empty_json)

    classifier = create_classifier_agent()
    classifier.before_model_callback = _inject_pdfs_for_classifier

    from app.agents.visual_grounding_synthesis import create_vg_synthesis_agents

    main_agent, details_agent = create_vg_synthesis_agents()

    return SequentialAgent(
        name="visual_grounding_pipeline",
        sub_agents=[
            classifier,
            ParallelAgent(
                name="vg_extraction",
                sub_agents=[*extractors],
            ),
            SequentialAgent(
                name="vg_synthesis",
                sub_agents=[main_agent, details_agent],
            ),
        ],
    )


def create_vg_app(root_agent, *, name: str = "d_done") -> App:
    """Wrap an agent in an App with context caching for synthesis prompts.

    The audit prompt + schema (~8K tokens) is repeated per run; Gemini context
    caching ($0.20/1M vs $2/1M) reduces cost on that portion.

    Note: App requires name to be a valid identifier (letters, digits, underscores).
    Pass app_name=APP_NAME to Runner to override for session lookup if needed.
    """
    # App requires valid identifier; replace hyphens for internal use
    app_name = name.replace("-", "_") if "-" in name else name
    return App(
        name=app_name,
        root_agent=root_agent,
        context_cache_config=ContextCacheConfig(
            min_tokens=4096,  # Gemini 2.5 Pro minimum for caching
            ttl_seconds=1800,  # 30 minutes
            cache_intervals=10,
        ),
    )


# HITL: state key for tenant data presented to user for review
STATE_HITL_TENANT_DATA = "_hitl_tenant_data"


async def _store_hitl_tenant_data(callback_context: CallbackContext) -> None:
    """After main synthesis agent: copy agreement_extraction.tenant_records for HITL review."""
    agreement_extraction: dict = callback_context.state.get("agreement_extraction") or {}
    tenant_records = agreement_extraction.get("tenant_records") or []
    callback_context.state[STATE_HITL_TENANT_DATA] = tenant_records
    return None


def create_visual_grounding_pipeline_phase1() -> SequentialAgent:
    """Phase 1 only: classifier -> extractors -> main synthesis agent (no details agent).

    Used for HITL: after Phase 1 we pause, present tenant table for review, then run Phase 2
    via approve-tenant-table endpoint. Main agent has after_agent_callback to store
    agreement_extraction.tenant_records in STATE_HITL_TENANT_DATA.
    """
    from app.agents.doc_classifier_agent import create_classifier_agent

    from app.agents.extractors.company_docs.agent import create_agent as company_docs
    from app.agents.extractors.credit_committee.agent import (
        create_agent as credit_committee,
    )
    from app.agents.extractors.planning_permit.agent import (
        create_agent as planning_permit,
    )
    from app.agents.extractors.pledges_registry.agent import (
        create_agent as pledges_registry,
    )
    from app.agents.extractors.project_agreement.agent import (
        create_agent as agreement,
    )
    from app.agents.extractors.project_agreement_additions.agent import (
        create_agent as agreement_additions,
    )
    from app.agents.extractors.signing_protocol.agent import (
        create_agent as signing_protocol,
    )
    from app.agents.extractors.tabu.agent import create_agent as tabu
    from app.agents.extractors.zero_report.agent import create_agent as zero_report

    extractors = [
        tabu(),
        zero_report(),
        agreement(),
        agreement_additions(),
        credit_committee(),
        company_docs(),
        signing_protocol(),
        planning_permit(),
        pledges_registry(),
    ]

    vg_config = make_generate_config(max_output_tokens=VG_MAX_OUTPUT_TOKENS)

    for ext in extractors:
        ext.model = GEMINI_31_PRO
        if vg_config is not None:
            ext.generate_content_config = vg_config
        ext.after_model_callback = _repair_truncated_json
        accepted = EXTRACTOR_DOC_TYPES.get(ext.name, [])
        empty_json = ext.output_schema().model_dump_json()
        ext.before_model_callback = _make_inject_pdfs_filtered(accepted, empty_json)

    classifier = create_classifier_agent()
    classifier.before_model_callback = _inject_pdfs_for_classifier

    from app.agents.visual_grounding_synthesis import create_vg_synthesis_agents

    main_agent, _details_agent = create_vg_synthesis_agents()
    main_agent.after_agent_callback = _store_hitl_tenant_data

    return SequentialAgent(
        name="visual_grounding_pipeline_phase1",
        sub_agents=[
            classifier,
            ParallelAgent(
                name="vg_extraction",
                sub_agents=[*extractors],
            ),
            main_agent,
        ],
    )
