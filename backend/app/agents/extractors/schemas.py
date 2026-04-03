"""Shared extraction schemas for document extractors.

This module defines only the shared timeline/evidence type used by all extractors.
Each extractor's output schema lives in its own folder, e.g. extractors/tabu/schema.py.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.agents.schemas import EvidentiaryReference


# ---------------------------------------------------------------------------
# Extractor timeline event — same evidentiary shape as report timeline/findings
# ---------------------------------------------------------------------------


class ExtractorTimelineEvent(BaseModel):
    """Dated event with Evidentiary Reference. Synthesis maps to TimelineEvent (SourceRef)."""

    date: str = Field(description="Date of the event in YYYY-MM-DD format")
    event_description: str = Field(description="Description of the event in Hebrew")
    source: EvidentiaryReference = Field(
        description="אסמכתא ראייתית — source_document_name, page_number, verbatim_quote"
    )
