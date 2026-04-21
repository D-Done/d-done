"""M&A chapter + document-kind constants.

These stay colocated so the router, chapter agents, completeness agent, and
assembler all agree on the same set of ids.
"""

from __future__ import annotations

from typing import Final


# --- Mandatory chapters (v1 scope) ----------------------------------------

CHAPTER_TRANSACTION_OVERVIEW: Final = "transaction_overview"
CHAPTER_CORPORATE_GOVERNANCE: Final = "corporate_governance"
CHAPTER_CUSTOMER_OBLIGATIONS: Final = "customer_obligations"
CHAPTER_SUPPLIER_OBLIGATIONS: Final = "supplier_obligations"
CHAPTER_HR: Final = "hr"
CHAPTER_REGULATORY: Final = "regulatory"
CHAPTER_LITIGATION: Final = "litigation"
CHAPTER_TAXATION: Final = "taxation"
CHAPTER_FINANCIAL_DEBT: Final = "financial_debt"
CHAPTER_INSURANCE: Final = "insurance"

MA_MANDATORY_CHAPTERS: Final[tuple[str, ...]] = (
    CHAPTER_TRANSACTION_OVERVIEW,
    CHAPTER_CORPORATE_GOVERNANCE,
    CHAPTER_CUSTOMER_OBLIGATIONS,
    CHAPTER_SUPPLIER_OBLIGATIONS,
    CHAPTER_HR,
    CHAPTER_REGULATORY,
    CHAPTER_LITIGATION,
    CHAPTER_TAXATION,
    CHAPTER_FINANCIAL_DEBT,
    CHAPTER_INSURANCE,
)

CHAPTER_TITLES_HE: Final[dict[str, str]] = {
    CHAPTER_TRANSACTION_OVERVIEW: "סקירת העסקה",
    CHAPTER_CORPORATE_GOVERNANCE: "ממשל תאגידי",
    CHAPTER_CUSTOMER_OBLIGATIONS: "התחייבויות ללקוחות",
    CHAPTER_SUPPLIER_OBLIGATIONS: "התחייבויות לספקים",
    CHAPTER_HR: "משאבי אנוש",
    CHAPTER_REGULATORY: "רגולציה ורישוי",
    CHAPTER_LITIGATION: "התדיינויות וסיכונים",
    CHAPTER_TAXATION: "מיסוי",
    CHAPTER_FINANCIAL_DEBT: "חוב פיננסי",
    CHAPTER_INSURANCE: "ביטוח",
}


# --- Doc kinds the router may emit ----------------------------------------
# Best-effort single-label classification used for the File.doc_type column
# (for backward-compatibility with the finance-era tooling) alongside the
# per-document chapter_tags list the router also emits.

MA_DOC_KINDS: Final[tuple[str, ...]] = (
    "spa",
    "cap_table",
    "board_resolutions",
    "shareholders_agreement",
    "employment_agreement",
    "customer_contract",
    "supplier_contract",
    "nda",
    "license_permit",
    "financial_statement",
    "tax_assessment",
    "insurance_policy",
    "litigation_pleading",
    "financing_agreement",
    "unknown",
)


# --- Session state keys ---------------------------------------------------

STATE_MA_CLASSIFICATION = "ma_classification"
STATE_MA_METADATA = "ma_project_metadata"
STATE_MA_COMPLETENESS = "ma_completeness"


def chapter_state_key(chapter_id: str) -> str:
    """State key where a chapter agent writes its typed output."""
    return f"ma_chapter_{chapter_id}"
