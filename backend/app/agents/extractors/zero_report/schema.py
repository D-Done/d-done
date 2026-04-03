"""Zero Report (דו״ח אפס) extractor schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.agents.extractors.schemas import ExtractorTimelineEvent
from app.agents.schemas import EvidentiaryReference


class BudgetLineItem(BaseModel):
    category: str = Field(description="Budget category in Hebrew")
    amount_ils: float = Field(description="Amount in ILS")
    notes: str | None = None


class DeveloperApplicableCost(BaseModel):
    """A single developer-applicable cost item (אגרות, פיתוח, מימון, etc.)."""

    cost_name: str | None = Field(default=None, description="Cost name in Hebrew")
    amount_ils: float | None = Field(default=None, description="Amount in ILS")
    source: EvidentiaryReference | None = Field(
        default=None,
        description="Mandatory evidentiary reference for this cost item",
    )


class DeveloperEntityChange(BaseModel):
    """Change in developer identity or ownership structure during the project."""

    original_developer: str | None = Field(
        default=None, description="Original developer entity name in Hebrew"
    )
    current_developer: str | None = Field(
        default=None, description="Current developer entity name in Hebrew"
    )
    change_details: str | None = Field(
        default=None,
        description="Description of the change (share transfer, name change, new partner, etc.) in Hebrew",
    )


class IndexationDetails(BaseModel):
    """Guarantee / budget indexation (הצמדה למדד) details."""

    index_name: str | None = Field(
        default=None,
        description="Name of the index (e.g., מדד תשומות הבנייה, מדד המחירים לצרכן)",
    )
    base_date: str | None = Field(
        default=None,
        description="Base date for the index (מדד בסיס), YYYY-MM-DD if available",
    )
    mechanism: str | None = Field(
        default=None,
        description="Linkage mechanism description in Hebrew",
    )


class ZeroReportExtraction(BaseModel):
    """Structured output of the Zero-Report agent."""

    appraiser_name: str | None = Field(default=None, description="Appraiser name")
    report_date: str | None = Field(default=None, description="YYYY-MM-DD")
    addressee: str | None = Field(
        default=None,
        description="The party to whom the report is addressed (נמען), e.g. the financing body",
    )
    total_project_cost_ils: float | None = Field(
        default=None, description="Total project cost in ILS"
    )
    total_projected_revenue_ils: float | None = Field(
        default=None, description="Total projected revenue in ILS"
    )
    profit_on_turnover: float | None = Field(
        default=None,
        description="Profit on Turnover (רווח למחזור) = (Revenue − Cost) / Revenue",
    )
    profit_on_cost: float | None = Field(
        default=None,
        description="Profit on Cost (רווח לעלות) = (Revenue − Cost) / Cost",
    )
    equity_amount_ils: float | None = Field(
        default=None, description="Developer equity contribution in ILS"
    )
    equity_confirmed: bool | None = Field(
        default=None,
        description="Whether equity is confirmed by CPA certificate or Supervisor",
    )
    equity_confirmation_details: str | None = Field(
        default=None,
        description="Details of the equity confirmation source",
    )
    construction_restrictions: list[str] = Field(
        default_factory=list,
        description=(
            "Physical or planning restrictions found: antiquities (עתיקות), "
            "preservation orders, unique construction constraints, etc."
        ),
    )
    indexation_details: str | None = Field(
        default=None,
        description=(
            "Free-text summary of indexation: index name, base date, and mechanism. "
            "Set to 'אין התייחסות למדד בדו\"ח האפס' if not mentioned."
        ),
    )
    indexation: IndexationDetails | None = Field(
        default=None,
        description="Structured indexation details (populated when present in the report)",
    )
    budget_lines: list[BudgetLineItem] = Field(default_factory=list)
    key_assumptions: list[str] = Field(default_factory=list)
    discrepancies: list[str] = Field(
        default_factory=list,
        description="Budget / feasibility discrepancies found",
    )
    rent_guarantee_duration_months: float | None = Field(
        default=None,
        description=(
            "Duration of the rent guarantee (ערבות שכירות) as stated in the report, in months. "
            "Null if not mentioned."
        ),
    )
    guarantees_mentioned: list[str] = Field(
        default_factory=list,
        description=(
            "List of guarantee types mentioned in the zero report (e.g. ערבות שכירות, "
            "ערבות חוק המכר, ערבות ביצוע). In Hebrew, one item per guarantee type."
        ),
    )
    estimated_permit_date: str | None = Field(
        default=None,
        description="Expected date for obtaining building permit (YYYY-MM-DD or partial e.g. 2025-Q2)",
    )
    construction_duration_months: float | None = Field(
        default=None,
        description="Total duration of construction phase in months, as estimated in the report",
    )
    schedule_summary_he: str | None = Field(
        default=None,
        description="Concise Hebrew description of project timeline: start, completion, major milestones",
    )
    timeline_events: list[ExtractorTimelineEvent] = Field(default_factory=list)
    developer_applicable_costs: list[DeveloperApplicableCost] = Field(
        default_factory=list,
        description=(
            "Explicit costs/fees applicable to the developer (e.g. אגרות, פיתוח, מימון) "
            "as stated in the report, each with a mandatory source citation."
        ),
    )
    tenant_benefits: list[str] = Field(
        default_factory=list,
        description=(
            "Benefits granted to existing tenants as stated in the agreement or any "
            "addenda/appendices, in Hebrew. Empty list if none mentioned."
        ),
    )
    developer_entity_change: DeveloperEntityChange | None = Field(
        default=None,
        description=(
            "Explicit change in developer identity, ownership structure, or holdings "
            "during the project's life. Null if no such change is mentioned."
        ),
    )
    notes: list[str] = Field(default_factory=list)


__all__ = ["ZeroReportExtraction", "DeveloperApplicableCost", "DeveloperEntityChange"]
