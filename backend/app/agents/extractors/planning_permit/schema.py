"""Planning Permit / Committee Decision (היתר בניה / החלטת ועדה) extractor schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.agents.extractors.schemas import ExtractorTimelineEvent


class ProjectScopeState(BaseModel):
    """Building / unit counts for a single project state (authorized or pre-demolition)."""

    building_count: int | None = Field(default=None, description="Number of buildings")
    apartment_count: int | None = Field(
        default=None, description="Number of residential units"
    )
    commercial_area_sqm: float | None = Field(
        default=None, description="Commercial area in sqm if stated"
    )
    total_built_area_sqm: float | None = Field(
        default=None, description="Total built area in sqm if stated"
    )
    description: str | None = Field(
        default=None, description="Free-text scope description in Hebrew"
    )


class PlanningPermitExtraction(BaseModel):
    """Structured output of the Planning-Permit / Committee-Decision agent."""

    decision_date: str | None = Field(
        default=None,
        description="Date of the committee decision or building permit (YYYY-MM-DD)",
    )
    decision_summary: str | None = Field(
        default=None,
        description="Summary of the main points (עיקרי ההחלטה/היתר) in Hebrew",
    )
    validity_status: str | None = Field(
        default=None,
        description="Validity period or expiration status (תוקף) in Hebrew",
    )
    validity_expiry_date: str | None = Field(
        default=None,
        description="Expiration date if explicitly stated (YYYY-MM-DD)",
    )
    property_details: str | None = Field(
        default=None,
        description="Property identification (גוש, חלקה, כתובת) in Hebrew",
    )
    scope_authorized: ProjectScopeState | None = Field(
        default=None,
        description="Project scope that was authorized for construction (מה שהותר לבניה)",
    )
    scope_pre_demolition: ProjectScopeState | None = Field(
        default=None,
        description="Project scope prior to demolition (מצב ערב ההריסה)",
    )
    conditions: list[str] = Field(
        default_factory=list,
        description="Conditions or stipulations attached to the permit/decision",
    )
    timeline_events: list[ExtractorTimelineEvent] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


__all__ = ["PlanningPermitExtraction"]
