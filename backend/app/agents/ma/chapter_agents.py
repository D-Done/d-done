"""Chapter-agent factory for M&A v1.

Each of the 10 mandatory chapters runs as a Gemini 3.1 Pro agent producing
``ChapterOutput``. The factory returns a list of ADK Agents configured with:

- model = gemini-3.1-pro-preview (native PDF + box_2d)
- output_schema = ChapterOutput (unified shape)
- output_key = chapter_state_key(chapter_id)
- before_model_callback = injects only the PDFs tagged for this chapter
- after_model_callback = repairs truncated JSON (shared helper)

We intentionally reuse the finance pipeline's ``VG_INSTRUCTION`` and
``_repair_truncated_json`` helpers so any improvement there flows through
automatically.
"""

from __future__ import annotations

import json
import logging

from google.adk.agents import Agent
from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from app.agents.constants import (
    STATE_DOCUMENT_NAMES,
    STATE_GCS_URIS,
)
from app.agents.ma.chapter_prompts import build_chapter_prompt
from app.agents.ma.constants import (
    CHAPTER_TITLES_HE,
    MA_MANDATORY_CHAPTERS,
    STATE_MA_CLASSIFICATION,
    chapter_state_key,
)
from app.agents.ma.report_schema import ChapterOutput
from app.agents.utils import make_generate_config
from app.agents.visual_grounding_pipeline_agent import (
    GEMINI_31_PRO,
    VG_INSTRUCTION,
    VG_MAX_OUTPUT_TOKENS,
    _build_manifest,
    _repair_truncated_json,
)

logger = logging.getLogger(__name__)


def _empty_chapter_json(chapter_id: str) -> str:
    """Serialized default ``ChapterOutput`` for the no-docs-tagged fallback."""
    return ChapterOutput(
        chapter_id=chapter_id,
        chapter_title_he=CHAPTER_TITLES_HE[chapter_id],
        summary_he="לא נמצאו מסמכים רלוונטיים לפרק זה.",
        empty_state=True,
    ).model_dump_json()


def _make_inject_pdfs_by_chapter(chapter_id: str, empty_json: str):
    """Return a ``before_model_callback`` that filters PDFs by chapter tag.

    Reads ``STATE_MA_CLASSIFICATION`` written by the M&A classifier and
    picks only the documents whose ``chapter_tags`` include this chapter.
    When nothing matches, short-circuits with an empty_state ChapterOutput —
    saves a Pro-tier API call.
    """

    def _callback(
        callback_context: CallbackContext, llm_request: LlmRequest
    ) -> LlmResponse | None:
        classification: dict = (
            callback_context.state.get(STATE_MA_CLASSIFICATION) or {}
        )
        documents = classification.get("documents") or []
        tagged_names: set[str] = {
            doc.get("filename")
            for doc in documents
            if chapter_id in (doc.get("chapter_tags") or [])
            and doc.get("filename")
        }

        all_uris: list[str] = callback_context.state.get(STATE_GCS_URIS, [])
        all_names: list[str] = callback_context.state.get(STATE_DOCUMENT_NAMES, [])

        matched_pairs = [
            (uri, name)
            for uri, name in zip(all_uris, all_names)
            if name in tagged_names
        ]

        if not matched_pairs:
            logger.info(
                "ma_chapter[%s]: no documents tagged, short-circuiting to empty_state",
                chapter_id,
            )
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
        logger.info(
            "ma_chapter[%s]: injected %d tagged PDFs", chapter_id, len(matched_pairs)
        )
        return None

    return _callback


def _create_chapter_agent(chapter_id: str) -> Agent:
    """Build a single chapter agent."""
    instruction = build_chapter_prompt(chapter_id)
    empty_json = _empty_chapter_json(chapter_id)
    agent = Agent(
        name=f"ma_chapter_{chapter_id}",
        model=GEMINI_31_PRO,
        instruction=instruction,
        description=(
            f"M&A chapter agent for {CHAPTER_TITLES_HE[chapter_id]}. "
            f"Reads only PDFs tagged for '{chapter_id}' and produces the "
            f"ChapterOutput with box_2d citations."
        ),
        output_schema=ChapterOutput,
        output_key=chapter_state_key(chapter_id),
        generate_content_config=make_generate_config(
            max_output_tokens=VG_MAX_OUTPUT_TOKENS
        ),
        after_model_callback=_repair_truncated_json,
    )
    agent.before_model_callback = _make_inject_pdfs_by_chapter(chapter_id, empty_json)
    return agent


def create_ma_chapter_agents() -> list[Agent]:
    """Return one agent per chapter in ``MA_MANDATORY_CHAPTERS``."""
    return [_create_chapter_agent(cid) for cid in MA_MANDATORY_CHAPTERS]


__all__ = ["create_ma_chapter_agents"]
