"""Pledges Registry (רשם המשכונות — Rasham Hamashkonot) extractor schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.agents.schemas import EvidentiaryReference


class PledgeEntry(BaseModel):
    """A single pledge in favor of a controlling shareholder."""

    pledge_number: str = Field(description="Pledge/reference number as in the report")
    pledgee_name: str = Field(
        description="Name of the pledgee (בעל המשכון) — shareholder or entity"
    )
    registration_date: str = Field(
        description="Date of registration in YYYY-MM-DD"
    )
    source: EvidentiaryReference = Field(
        description="אסמכתא ראייתית — source_document_name, page_number, verbatim_quote"
    )


class PledgesRegistryExtraction(BaseModel):
    """Structured output of the Pledges Registry (Rasham Hamashkonot) agent.

    Extracts pledgees from the Pledges Register Report and cross-references
    with controlling shareholders.
    """

    pledge_entries: list[PledgeEntry] = Field(
        default_factory=list,
        description="Pledges in favor of controlling shareholders: pledge number, pledgee name, registration date",
    )
    no_pledges_identified: bool = Field(
        default=False,
        description="True when no pledges in favor of controlling shareholders were found",
    )
    notes: list[str] = Field(
        default_factory=list,
        description="Additional notes in Hebrew",
    )


__all__ = ["PledgesRegistryExtraction", "PledgeEntry"]
