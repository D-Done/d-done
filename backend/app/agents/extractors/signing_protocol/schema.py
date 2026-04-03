"""Signing Protocol (פרוטוקול מורשה חתימה) extractor schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.agents.extractors.schemas import ExtractorTimelineEvent


class AuthorizedSignatory(BaseModel):
    name: str = Field(description="Signatory name")
    id_number: str | None = Field(default=None, description="ID number if stated")
    role: str | None = Field(default=None, description="Role / title in Hebrew")
    signing_authority: str = Field(
        description="Scope of signing authority in Hebrew (e.g., לחתום על הסכמי מימון)"
    )


class SigningProtocolExtraction(BaseModel):
    """Structured output of the Signing-Protocol agent."""

    protocol_date: str | None = Field(default=None, description="YYYY-MM-DD")
    company_name: str | None = Field(default=None, description="Company issuing the protocol")
    resolution_type: str | None = Field(
        default=None,
        description="Type of resolution in Hebrew (e.g., החלטת דירקטוריון)",
    )
    authorized_signatories: list[AuthorizedSignatory] = Field(default_factory=list)
    signing_combination: str | None = Field(
        default=None,
        description="Required signing combination in Hebrew (e.g., שניים מתוך שלושה)",
    )
    scope_limitations: list[str] = Field(
        default_factory=list,
        description="Any limitations on signing authority",
    )
    timeline_events: list[ExtractorTimelineEvent] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


__all__ = ["SigningProtocolExtraction"]
