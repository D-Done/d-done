"""Tabu (Land Registry) extractor schemas.

Domain 1: Caveats & restrictive notes (non-mortgage encumbrances)
Domain 2: Mortgages
Domain 3: Registered owners
"""

from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field

from app.agents.extractors.schemas import ExtractorTimelineEvent


class RightsHolder(BaseModel):
    """A single registered owner / rights holder from the Tabu ownership section."""

    name: str = Field(description="Owner name exactly as registered in the Tabu")
    id_number: str | None = Field(default=None, description="ID number if stated")
    ownership_share: str | None = Field(
        default=None,
        description="Ownership share as it appears in the Tabu",
    )
    acquisition_type: str | None = Field(
        default=None,
        description="Acquisition type as it appears in the Tabu. Example: מכר, צוואה, ירושה",
    )
    deed_or_reference_number: str | None = Field(
        default=None, description="Deed / reference number if stated"
    )
    verbatim_quote: str = Field(
        description="Mandatory verbatim snippet from the Tabu proving this entry"
    )


class CavetNoticeRecord(BaseModel):
    """A single caveat / warning-note (הערת אזהרה) or restrictive-note registration."""

    registration_type: Literal["הערת אזהרה", "הערה מגבילה", "אחר"] = Field(
        description="The specific type of registration allowed."
    )
    beneficiary: str | None = Field(
        default=None,
        description="Beneficiary name as it appears in the Tabu. Leave null if unclear.",
    )
    deed_or_reference_number: str | None = Field(
        default=None, description="Deed / reference number if stated"
    )
    registration_date: str | None = Field(
        default=None, description="Registration date as in the Tabu"
    )
    amount_or_rank: str | None = Field(
        default=None, description="Amount or rank if stated"
    )
    verbatim_quote: str = Field(
        description="Mandatory verbatim snippet proving this caveat registration"
    )


class MortgageRecord(BaseModel):
    """A single mortgage registration from the Tabu."""

    registration_type: str | None = Field(
        default=None,
        description='Label as it appears, e.g. "משכנתא", "הערת אזהרה לרישום משכנתה"',
    )
    bank_or_lender: str | None = Field(
        default=None,
        description="Bank / lending institution name as it appears in the Tabu",
    )
    deed_or_reference_number: str | None = Field(
        default=None, description="Deed / reference number if stated"
    )
    registration_date: str | None = Field(
        default=None, description="Registration date as in the Tabu"
    )
    rank_or_degree: str | None = Field(
        default=None, description="Mortgage rank / degree (דרגה) if stated"
    )
    amount: str | None = Field(default=None, description="Mortgage amount if stated")
    verbatim_quote: str = Field(
        description="Mandatory verbatim snippet proving this mortgage registration"
    )


class SubParcelExtraction(BaseModel):
    """All extracted data for a single sub-parcel from the Tabu body."""

    sub_parcel_number: str = Field(description="Sub-parcel identifier from the body")
    rights_holders: list[RightsHolder] = Field(
        default_factory=list,
        description="Registered owners from the ownership section (בעלויות)",
    )
    caveats: list[CavetNoticeRecord] = Field(
        default_factory=list,
        description="Non-mortgage encumbrances: caveats & restrictive notes",
    )
    mortgages: list[MortgageRecord] = Field(
        default_factory=list,
        description="Mortgage registrations (משכנתאות)",
    )
    notes_excluded_transfer_to_foreigners: bool = Field(
        default=False,
        description="True if a 'transfer to foreigners' note was found but excluded from caveats",
    )


class TabuExtraction(BaseModel):
    """Structured data extracted from a single Tabu (Land Registry) extract document.

    Combines three extraction domains into a single per-sub-parcel structure:
    1. Non-mortgage encumbrances (caveats, restrictive notes)
    2. Mortgage registrations
    3. Registered owners / rights holders

    The body of the Tabu extract is authoritative for sub-parcel identification.
    Header/title counts are ignored.
    """

    address: str = Field(description="Full property address as it appears in the Tabu")
    block: str = Field(description="Parcel block (גוש)")
    parcel: str = Field(description="Parcel number (חלקה)")
    source_document_name: str = Field(
        description="Exact filename of the Tabu PDF this data was extracted from"
    )

    sub_parcels: list[SubParcelExtraction] = Field(
        description="One entry per sub-parcel found in the Tabu body"
    )

    timeline_events: list[ExtractorTimelineEvent] = Field(default_factory=list)
    notes: list[str] = Field(
        default_factory=list, description="Additional observations in Hebrew"
    )


class TabuExtractionResult(BaseModel):
    """Top-level output of the Tabu extractor.

    When multiple Tabu extract PDFs are provided (e.g. one per parcel),
    each is extracted independently and placed in ``parcels``.
    """

    parcels: list[TabuExtraction] = Field(
        default_factory=list,
        description=(
            "One entry per Tabu extract PDF. "
            "If two PDFs cover parcels 590 and 591, this list has two entries."
        )
    )


__all__ = ["TabuExtraction", "TabuExtractionResult"]
