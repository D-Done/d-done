"""Company Documents (מסמכי חברה) extractor schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.agents.schemas import UboGraph
from app.agents.extractors.schemas import ExtractorTimelineEvent


class CompanyOfficer(BaseModel):
    name: str = Field(description="Officer / director name")
    role: str = Field(description="Role in Hebrew (e.g., מנהל, דירקטור)")
    id_number: str | None = Field(default=None, description="ID number if stated")


class CompanyDocsExtraction(BaseModel):
    """Structured data extracted from a single company document (נסח חברה or תעודת התאגדות)."""

    source_document_name: str = Field(
        description="Exact filename of the company document this data was extracted from"
    )
    company_name: str = Field(description="Full registered company name")
    company_number: str | None = Field(
        default=None, description="Company registration number"
    )
    incorporation_date: str | None = Field(default=None, description="YYYY-MM-DD")
    company_type: str | None = Field(
        default=None, description="Company type in Hebrew (e.g., חברה פרטית)"
    )
    registered_address: str | None = Field(
        default=None, description="Registered address"
    )
    share_capital: str | None = Field(
        default=None, description="Total share capital as stated in the extract"
    )
    officers: list[CompanyOfficer] = Field(default_factory=list)
    shareholders: list[str] = Field(
        default_factory=list,
        description="Shareholder names and percentages",
    )
    ubo_chain: list[str] = Field(
        default_factory=list,
        description="UBO trace from holding entities to natural persons",
    )
    ubo_graph: UboGraph | None = Field(
        default=None,
        description="Structured ownership graph (nodes + edges) for UI visualization",
    )
    active_status: bool = Field(
        default=True, description="Whether the company is active (not dissolved)"
    )
    liens_or_charges: list[str] = Field(
        default_factory=list,
        description="Active charges: type, amount secured, and whether general or project-specific. Empty if none; use notes to state 'אין שעבודים רשומים' when applicable.",
    )
    timeline_events: list[ExtractorTimelineEvent] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class CompanyDocsExtractionResult(BaseModel):
    """Top-level output of the Company-Documents extractor.

    When multiple company documents are provided (e.g. נסח חברה for each of
    the developer, the contractor, and the holding company), each is extracted
    independently and placed in ``companies``.
    """

    companies: list[CompanyDocsExtraction] = Field(
        default_factory=list,
        description=(
            "One entry per company document PDF. "
            "If four PDFs cover four different companies, this list has four entries."
        )
    )


__all__ = ["CompanyDocsExtraction", "CompanyDocsExtractionResult"]
