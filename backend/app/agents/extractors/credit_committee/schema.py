"""Credit Committee (ועדת אשראי) extractor schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.agents.schemas import EvidentiaryReference
from app.agents.extractors.schemas import ExtractorTimelineEvent


class CreditCondition(BaseModel):
    condition: str = Field(description="Condition text in Hebrew")
    is_met: bool | None = Field(
        default=None, description="Whether the condition was met (null if unknown)"
    )
    source: EvidentiaryReference | None = None


class CreditCommitteeExtraction(BaseModel):
    """Structured output of the Credit-Committee agent."""

    financing_body_name: str | None = Field(
        default=None,
        description="Name of the financing institution (bank, fund, etc.) issuing the credit",
    )
    committee_date: str | None = Field(default=None, description="YYYY-MM-DD")
    approved_amount_ils: float | None = Field(
        default=None, description="Approved credit facility amount in ILS"
    )
    interest_rate: str | None = Field(
        default=None, description="Interest rate / terms as stated"
    )
    loan_term_months: int | None = Field(
        default=None, description="Loan term in months"
    )
    # Project / compound details (TASK 2)
    project_address: str | None = Field(
        default=None, description="Full project address in Hebrew"
    )
    gush: str | None = Field(default=None, description="Block number (גוש)")
    helka: str | None = Field(default=None, description="Parcel number (חלקה)")
    existing_buildings_count: int | None = Field(
        default=None, description="Number of existing buildings before demolition"
    )
    existing_apartments_count: int | None = Field(
        default=None, description="Number of existing apartments before demolition"
    )
    planned_buildings_count: int | None = Field(
        default=None, description="Number of planned buildings after construction"
    )
    planned_apartments_count: int | None = Field(
        default=None, description="Number of planned apartments after construction"
    )
    collateral_requirements: list[str] = Field(
        default_factory=list,
        description="Required collateral / security as listed by the committee",
    )
    conditions_precedent: list[CreditCondition] = Field(
        default_factory=list,
        description="Conditions precedent (תנאים מתלים) for drawdown",
    )
    special_covenants: list[str] = Field(
        default_factory=list,
        description="Special covenants or restrictions",
    )
    risk_notes: list[str] = Field(
        default_factory=list,
        description="Risk items flagged by the committee",
    )
    timeline_events: list[ExtractorTimelineEvent] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


__all__ = ["CreditCommitteeExtraction"]
