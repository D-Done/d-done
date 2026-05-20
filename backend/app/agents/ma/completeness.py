"""Completeness aggregator for M&A v1.

Reads every chapter's ``follow_ups`` from session state and produces a
deduped, prioritized ``CompletenessChecklist``. Runs as an ADK Agent with a
dynamic instruction builder (no new PDF reads needed — it works off the
structured follow-ups collected by the chapter agents), which keeps token
usage small and predictable.
"""

from __future__ import annotations

import json
import logging

from google.adk.agents import Agent
from google.adk.agents.readonly_context import ReadonlyContext

from app.agents.constants import PRO_MODEL
from app.agents.ma.constants import (
    CHAPTER_TITLES_HE,
    MA_ALL_CHAPTERS,
    MA_MANDATORY_CHAPTERS,
    STATE_MA_COMPLETENESS,
    chapter_state_key,
)
from app.agents.ma.report_schema import CompletenessChecklist
from app.agents.utils import make_generate_config

logger = logging.getLogger(__name__)


_PREAMBLE = """\
# Role: M&A DD Completeness Reviewer

You receive every chapter agent's ``follow_ups`` — missing documents,
required clarifications, and open questions. Your job is to produce a
single, deduped, prioritized ``CompletenessChecklist`` covering the whole
file.

## Rules

- Dedupe items that describe the same gap across chapters; merge their
  chapter ids into ``chapter_ids``.
- Preserve the most severe severity (critical > warning > info) when merging.
- Keep the ``description`` Hebrew and specific enough that the reviewing
  lawyer can act on it without re-reading the chapter.
- Assign stable ``id`` values like ``cmp-001``, ``cmp-002``, ...
- If ``suggested_document`` is set on any merged source, pick the most
  specific one (prefer concrete Hebrew doc names over generic phrasing).
- Leave ``items`` empty (with a short Hebrew ``summary_he``) when there are
  no open items across all chapters.

## CRITICAL — What NOT to flag

This is a due-diligence review of the TARGET COMPANY's existing documents.
The transaction has not been signed yet. DO NOT raise follow-ups for:
- Missing SPA (מניות הסכם מכר), term sheet, NDA between buyer and seller,
  or any other transaction document that is part of the deal being negotiated.
- Missing board resolutions or shareholder approvals approving the transaction
  itself (those are signed at closing, not before DD).
- Any document that by definition does not yet exist because the deal is
  still in the DD phase.
Flag only gaps in the TARGET COMPANY's own corporate, operational, and legal
documentation that a prudent buyer would expect to receive in a data room.

## Output

Strict ``CompletenessChecklist`` JSON. Do not invent follow-ups that were
not raised by a chapter.
"""


def _make_instruction_builder(
    chapters_to_review: tuple[str, ...]
):
    """Return a dynamic instruction builder that includes all selected chapters."""
    def _build_instruction(ctx: ReadonlyContext) -> str:
        blocks: list[str] = [_PREAMBLE, "# Per-chapter follow-ups"]

        for chapter_id in chapters_to_review:
            chapter_output = ctx.state.get(chapter_state_key(chapter_id)) or {}
            follow_ups = chapter_output.get("follow_ups") or []
            title_he = CHAPTER_TITLES_HE.get(chapter_id, chapter_id)
            blocks.append(
                f"## {chapter_id} — {title_he} ({len(follow_ups)} items)\n\n"
                + "```json\n"
                + json.dumps(follow_ups, ensure_ascii=False, indent=2)
                + "\n```"
            )

        return "\n\n".join(blocks)

    return _build_instruction


def create_ma_completeness_agent(
    optional_chapters: tuple[str, ...] | list[str] | None = None,
) -> Agent:
    """Return the completeness-aggregator agent.

    ``optional_chapters`` — the same selected optional chapters passed to
    ``create_ma_pipeline``.  When provided, their follow_ups are included in
    the completeness prompt alongside the mandatory chapters.
    """
    selected_optional = tuple(optional_chapters) if optional_chapters is not None else ()
    chapters_to_review = MA_MANDATORY_CHAPTERS + tuple(
        c for c in selected_optional if c in MA_ALL_CHAPTERS
    )
    instruction = _make_instruction_builder(chapters_to_review)

    return Agent(
        name="ma_completeness",
        model=PRO_MODEL,
        instruction=instruction,
        description=(
            "Aggregates every chapter's follow_ups into a single deduped, "
            "prioritized completeness checklist."
        ),
        include_contents="none",
        output_schema=CompletenessChecklist,
        output_key=STATE_MA_COMPLETENESS,
        generate_content_config=make_generate_config(max_output_tokens=65_536),
    )
