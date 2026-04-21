"""Multi-label M&A document classifier (Gemini Flash).

Looks at the first page of every uploaded PDF and returns:
- a best-guess single ``doc_kind`` (persisted to ``File.doc_type`` for the
  finance-era tooling that expects a single label), and
- a list of ``chapter_tags`` — which of the 10 M&A chapters this document is
  likely relevant to. The per-chapter agents read these tags via their
  before_model_callback to filter the PDFs they send to Gemini 3.1 Pro.

Multi-label is crucial for M&A: a single share-purchase agreement can be
relevant to Transaction Overview, Corporate Governance, and Taxation
simultaneously, and we don't want to force a single bucket.
"""

from __future__ import annotations

from google.adk.agents import Agent
from pydantic import BaseModel, Field

from app.agents.constants import FLASH_MODEL
from app.agents.ma.constants import (
    MA_DOC_KINDS,
    MA_MANDATORY_CHAPTERS,
    STATE_MA_CLASSIFICATION,
)
from app.agents.utils import make_generate_config


class MaDocumentClassification(BaseModel):
    """Per-document classification record."""

    filename: str = Field(description="Exact filename from the provided manifest")
    doc_kind: str = Field(
        description=(
            "Best single-label document kind. Must be one of: "
            + ", ".join(MA_DOC_KINDS)
        )
    )
    chapter_tags: list[str] = Field(
        default_factory=list,
        description=(
            "Zero or more chapter ids this document is relevant to. "
            "Must be a subset of: " + ", ".join(MA_MANDATORY_CHAPTERS)
        ),
    )
    notes: str | None = Field(
        default=None,
        description="Optional short note on why this file was tagged this way",
    )


class MaClassificationResult(BaseModel):
    """Top-level classifier output."""

    documents: list[MaDocumentClassification] = Field(
        default_factory=list,
        description="One entry per uploaded document (every file in the manifest)",
    )


_CLASSIFIER_PROMPT = f"""\
# Role: M&A Document Router

You classify documents uploaded to an Israeli M&A due-diligence workspace.
For every document in the manifest you produce:

1. ``filename`` — copy EXACTLY from the manifest.
2. ``doc_kind`` — a single best-fit label from the allowed set.
3. ``chapter_tags`` — ZERO OR MORE chapter ids this document is relevant to.
   Multi-label is expected. A share-purchase agreement is typically relevant
   to ``transaction_overview``, ``corporate_governance``, and ``taxation``
   simultaneously.
4. ``notes`` — optional one-sentence rationale.

## Inputs

- You receive one or more PDF documents via ``Part.from_uri``.
- The user message includes a numbered manifest of filenames. Keys in your
  output MUST match the manifest verbatim.
- Look at the **first 1-2 pages only** of each PDF — titles, headers, and
  signature blocks are enough. Do not read the full document.

## Allowed ``doc_kind`` labels

{", ".join(MA_DOC_KINDS)}

Choose ``unknown`` when the document doesn't fit any kind. Still assign
chapter tags where possible (an unknown-kind board email is still likely
``corporate_governance``).

## Allowed ``chapter_tags``

{chr(10).join(f"- {cid}" for cid in MA_MANDATORY_CHAPTERS)}

Do NOT invent new chapter ids. Return an empty list when nothing applies —
the document will then be excluded from every chapter.

## Tagging heuristics

- Share Purchase Agreement / Asset Purchase Agreement -> transaction_overview
  (always); add corporate_governance, taxation, and any chapter whose
  subject matter appears in the deal terms.
- Cap table, board/shareholder resolutions, shareholders agreement,
  authorized-signatory protocols -> corporate_governance.
- Customer contracts, SOWs, order forms -> customer_obligations.
- Supplier contracts, MSAs, vendor terms -> supplier_obligations.
- Employment agreements, option plans (ESOP), restrictive covenants,
  severance letters, HR policies -> hr.
- Regulatory licenses, permits, authority filings -> regulatory.
- Pleadings, settlement agreements, demand letters, complaints -> litigation.
- Tax assessments, tax rulings, tax authority correspondence -> taxation.
- Financing agreements, loan documents, promissory notes, guarantees,
  pledges / lien registrations -> financial_debt.
- Insurance policies, declarations, run-off / tail endorsements -> insurance.

One document can belong to several chapters — tag all that apply.

## Output

Strict JSON matching ``MaClassificationResult``: a single object with a
``documents`` list, one entry per file. Every file from the manifest MUST
appear exactly once.
"""


def create_ma_classifier_agent() -> Agent:
    """Return the Flash agent that tags each uploaded file."""
    return Agent(
        name="ma_doc_classifier",
        model=FLASH_MODEL,
        instruction=_CLASSIFIER_PROMPT,
        description=(
            "Multi-label M&A document classifier. Looks at the first page of "
            "each uploaded PDF and emits (doc_kind, chapter_tags[]) so chapter "
            "agents receive only the relevant subset."
        ),
        include_contents="none",
        output_schema=MaClassificationResult,
        output_key=STATE_MA_CLASSIFICATION,
        generate_content_config=make_generate_config(),
    )
