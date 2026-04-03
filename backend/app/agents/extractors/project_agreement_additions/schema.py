"""Agreement Additions (תוספות להסכם) extractor schemas.

Addenda and amendments to the main project agreement.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.agents.extractors.schemas import ExtractorTimelineEvent


class AgreementAdditionsExtraction(BaseModel):
    """Structured output of the Agreement Additions agent.

    Extracts data from addenda, amendments, and supplementary agreements
    (תוספות להסכם, הסכמי השלמה) to the main project/TAMA agreement.
    """

    addition_date: str | None = Field(
        default=None,
        description="Date of the addition/amendment in YYYY-MM-DD",
    )
    subject: str | None = Field(
        default=None,
        description="Subject or title of the addition in Hebrew",
    )
    summary: str | None = Field(
        default=None,
        description="Brief summary of what the addition amends or adds",
    )
    amended_clauses: list[str] = Field(
        default_factory=list,
        description="Clauses or terms that are amended or added (Hebrew)",
    )
    parties_involved: list[str] = Field(
        default_factory=list,
        description="Parties to the addition (e.g. developer, tenants, lender)",
    )
    timeline_events: list[ExtractorTimelineEvent] = Field(
        default_factory=list,
        description="Relevant dates (signing, effective date, etc.) with citations",
    )
    developer_cost_benefits: list[str] = Field(
        default_factory=list,
        description="Benefits in addenda that constitute a cost to the developer (הטבות המהוות עלות ליזם)",
    )
    notes: list[str] = Field(default_factory=list)


__all__ = ["AgreementAdditionsExtraction"]
