"""Other / general documents (מסמכים נוספים — אחר) extractor schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.agents.schemas import EvidentiaryReference
from app.agents.extractors.schemas import ExtractorTimelineEvent


class KeyFact(BaseModel):
    """A single key fact extracted from a general document."""

    label: str = Field(description="Fact label / category in Hebrew")
    value: str = Field(description="Fact value in Hebrew")
    source: EvidentiaryReference | None = Field(
        default=None, description="אסמכתא ראייתית for this fact"
    )


class OtherDocExtraction(BaseModel):
    """Extraction for documents that don't fit any specialised extractor.

    Captures general-purpose information relevant to a lender/lawyer
    performing due-diligence: parties, dates, obligations, risks.
    """

    document_type_guess: str = Field(
        description="Best-guess document type classification in Hebrew"
    )
    document_date: str | None = Field(
        default=None,
        description="Primary date of the document (YYYY-MM-DD) if identifiable",
    )
    parties: list[str] = Field(
        default_factory=list,
        description="Names of all parties / entities mentioned in the document",
    )
    key_facts: list[KeyFact] = Field(
        default_factory=list,
        description="Important facts, figures, and data points extracted from the document",
    )
    obligations: list[str] = Field(
        default_factory=list,
        description="Key obligations, covenants, or commitments found in the document (Hebrew)",
    )
    risk_flags: list[str] = Field(
        default_factory=list,
        description="Red flags or risk items a lender/lawyer should be aware of (Hebrew)",
    )
    timeline_events: list[ExtractorTimelineEvent] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


__all__ = ["OtherDocExtraction"]
