"""Pydantic schemas for M&A v1 DD report.

Design goals
------------
1. **Uniform chapter shape** — every one of the 10 mandatory chapters emits the
   same ``ChapterOutput`` structure. This avoids 10 bespoke schemas for the MVP
   while still giving lawyers the Finding + Follow-up + empty-state flags they
   need. Chapter-specific structure lives inside ``Finding.category`` /
   ``Finding.subsection`` text fields, which is enough for v1.
2. **Reuse finance report primitives** — ``EvidentiaryReference`` /
   ``SourceRef`` / ``BoundingBox`` from ``app.agents.schemas`` so the
   frontend's existing PDF citation viewer works unchanged (``box_2d`` ->
   ``bounding_boxes`` conversion is already implemented).
3. **Report-level project header** is populated server-side (mirrors the
   finance flow); agents must leave it ``None``.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.agents.schemas import (
    EvidentiaryReference,
    ExecutiveSummary,
    SourceRef,
    TimelineEvent,
    TransactionType,
)


# ---------------------------------------------------------------------------
# Project metadata (frontend -> DB -> report header)
# ---------------------------------------------------------------------------


class MaProjectMetadata(BaseModel):
    """Structured project details collected at project creation time.

    Persisted as ``Project.transaction_metadata``; surfaced on the report as
    ``project_header`` for display. Keeps the description Text column free of
    structured-ish strings.

    ``representing_role`` is intentionally a free-text string (not an enum):
    the finance flow sends Hebrew labels ("בנק", "חברת ביטוח", ...) and the
    M&A flow sends English slugs or Hebrew labels depending on UI copy. The
    display layer just renders whatever the user chose.
    """

    project_name: str | None = Field(
        default=None, description="Project / deal name as entered by the user"
    )
    client_name: str | None = Field(
        default=None, description="Client we are representing (law firm's client)"
    )
    representing_role: str | None = Field(
        default=None,
        description="Role our client plays in the deal (free-text, user-chosen)",
    )
    counterparty_name: str | None = Field(
        default=None, description="Counterparty (the other side of the deal)"
    )
    free_text_description: str | None = Field(
        default=None,
        description="Free-text notes the user entered on project creation",
    )


# ---------------------------------------------------------------------------
# Finding + Chapter output
# ---------------------------------------------------------------------------

FindingSeverity = Literal["critical", "warning", "info"]


class MaFinding(BaseModel):
    """One finding inside an M&A chapter.

    Mirrors the finance ``Finding`` but adds ``subsection`` for the PRD's
    nested structure (e.g. "Consideration" / "Earn-out" inside
    "Transaction Overview"). We don't enumerate subsections with a Literal —
    the prompts pre-define them — but we keep it as free text so small
    deviations don't blow up the schema.
    """

    id: str = Field(description="Stable id within the chapter, e.g. 'to-001'")
    subsection: str = Field(
        description=(
            "Chapter subsection this finding belongs to (e.g. 'Consideration', "
            "'Earn-out', 'Change of Control'). Free-text — use the English "
            "headings from the chapter prompt."
        )
    )
    severity: FindingSeverity = Field(description="critical | warning | info")
    title: str = Field(description="Short Hebrew title")
    description: str = Field(description="Detailed Hebrew description")
    sources: list[SourceRef] = Field(
        default_factory=list,
        description=(
            "Evidentiary references with mandatory box_2d. Empty ONLY when "
            "this finding is itself a 'no evidence found' note (use severity "
            "= 'info' and say so in the description)."
        ),
    )


class MaFollowUp(BaseModel):
    """A required follow-up / missing document / open question."""

    id: str = Field(description="Stable id, e.g. 'fu-corp-001'")
    description: str = Field(description="What is missing or needs clarification (Hebrew)")
    severity: FindingSeverity = Field(
        description="How urgent: critical (blocks closing), warning, info"
    )
    suggested_document: str | None = Field(
        default=None,
        description="If the gap is a missing document, name the doc we'd expect",
    )
    related_sources: list[EvidentiaryReference] = Field(
        default_factory=list,
        description=(
            "Optional evidentiary refs pointing to the inconsistency that "
            "triggered the follow-up (may include box_2d)."
        ),
    )


class ChapterOutput(BaseModel):
    """Uniform per-chapter output for M&A v1.

    Every chapter agent produces this shape — the assembler then indexes
    chapter outputs by ``chapter_id`` into ``MaDDReport.chapters``.
    """

    chapter_id: str = Field(
        description=(
            "Chapter slug, one of the ids in "
            "``app.agents.ma.constants.MA_MANDATORY_CHAPTERS``."
        )
    )
    chapter_title_he: str = Field(description="Hebrew chapter title for display")
    summary_he: str = Field(
        description=(
            "Executive summary of this chapter in Hebrew, 2-6 sentences. "
            "High-signal; lawyers read this first."
        )
    )
    empty_state: bool = Field(
        default=False,
        description=(
            "True when no documents relevant to this chapter were provided. "
            "Findings and follow-ups should still be empty lists in that case."
        ),
    )
    findings: list[MaFinding] = Field(
        default_factory=list,
        description="Structured findings with evidentiary references (box_2d).",
    )
    follow_ups: list[MaFollowUp] = Field(
        default_factory=list,
        description=(
            "Missing-document / required-action items surfaced by the chapter. "
            "These are also aggregated globally by the Completeness agent."
        ),
    )
    timeline_events: list[TimelineEvent] = Field(
        default_factory=list,
        description="Notable dated events found in this chapter's documents.",
    )


# ---------------------------------------------------------------------------
# Completeness checklist (cross-chapter aggregation)
# ---------------------------------------------------------------------------


class CompletenessItem(BaseModel):
    """One item in the global completeness checklist."""

    id: str = Field(description="Stable id, e.g. 'cmp-001'")
    chapter_ids: list[str] = Field(
        description="Chapters this gap belongs to (deduped)"
    )
    description: str = Field(description="What is missing (Hebrew)")
    severity: FindingSeverity = Field(description="critical | warning | info")
    suggested_document: str | None = Field(
        default=None,
        description="The document/asset we'd expect to close this gap",
    )


class CompletenessChecklist(BaseModel):
    """Deduped, prioritized, cross-chapter checklist of open items."""

    items: list[CompletenessItem] = Field(default_factory=list)
    summary_he: str | None = Field(
        default=None,
        description="Brief Hebrew narrative summarising the state of the file.",
    )


# ---------------------------------------------------------------------------
# Top-level report
# ---------------------------------------------------------------------------


class MaProjectHeader(BaseModel):
    """Server-populated project header (agent must leave null)."""

    project_name: str | None = None
    client_name: str | None = None
    representing_role: str | None = None
    counterparty_name: str | None = None
    status: str | None = None
    created_at: str | None = Field(
        default=None, description="ISO 8601 creation timestamp"
    )
    doc_count: int | None = None


class MaDDReport(BaseModel):
    """Complete M&A DD report — v1, 10 mandatory chapters only."""

    transaction_type: Literal[TransactionType.MA] = Field(
        default=TransactionType.MA,
        description="Always 'ma' for this report type",
    )

    project_header: MaProjectHeader | None = Field(
        default=None,
        description="Project metadata — filled server-side, agent leaves null",
    )

    executive_summary: ExecutiveSummary | None = Field(
        default=None,
        description=(
            "Top-of-report summary across all 10 chapters. Populated by the "
            "assembler from per-chapter summaries."
        ),
    )

    chapters: list[ChapterOutput] = Field(
        default_factory=list,
        description=(
            "The 10 mandatory chapter outputs, in the canonical order from "
            "``MA_MANDATORY_CHAPTERS``."
        ),
    )

    completeness: CompletenessChecklist | None = Field(
        default=None,
        description="Global completeness checklist (cross-chapter dedup)",
    )

    # NOTE: the frontend-facing report dict also carries an additional
    # ``_visual_grounding`` marker (set in the assembler callback) to indicate
    # that box_2d -> bounding_boxes conversion has already happened on the
    # server. It is intentionally NOT a Pydantic field (Pydantic disallows
    # leading-underscore attribute names); the assembler just sets it on the
    # dict after ``.model_dump()``. See ``_assemble_ma_report``.


__all__ = [
    "CompletenessChecklist",
    "CompletenessItem",
    "ChapterOutput",
    "MaDDReport",
    "MaFinding",
    "MaFollowUp",
    "MaProjectHeader",
    "MaProjectMetadata",
]
