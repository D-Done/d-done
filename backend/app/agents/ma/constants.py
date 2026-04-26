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
CHAPTER_CHANNEL_RESELLER_PARTNER: Final = "channel_reseller_partner"
CHAPTER_HR: Final = "hr"
CHAPTER_REGULATORY: Final = "regulatory"
CHAPTER_LITIGATION: Final = "litigation"
CHAPTER_TAXATION: Final = "taxation"
CHAPTER_FINANCIAL_DEBT: Final = "financial_debt"
CHAPTER_INSURANCE: Final = "insurance"
CHAPTER_TECHNOLOGY_PRODUCT: Final = "technology_product"
CHAPTER_IP_OWNERSHIP: Final = "ip_ownership"
CHAPTER_IP_LICENSING: Final = "ip_licensing"
CHAPTER_OSS: Final = "oss"

MA_MANDATORY_CHAPTERS: Final[tuple[str, ...]] = (
    CHAPTER_TRANSACTION_OVERVIEW,
    CHAPTER_CORPORATE_GOVERNANCE,
    CHAPTER_CUSTOMER_OBLIGATIONS,
    CHAPTER_SUPPLIER_OBLIGATIONS,
    CHAPTER_CHANNEL_RESELLER_PARTNER,
    CHAPTER_HR,
    CHAPTER_REGULATORY,
    CHAPTER_LITIGATION,
    CHAPTER_TAXATION,
    CHAPTER_FINANCIAL_DEBT,
    CHAPTER_INSURANCE,
    CHAPTER_TECHNOLOGY_PRODUCT,
    CHAPTER_IP_OWNERSHIP,
    CHAPTER_IP_LICENSING,
    CHAPTER_OSS,
)

CHAPTER_TITLES_HE: Final[dict[str, str]] = {
    CHAPTER_TRANSACTION_OVERVIEW: "סקירת העסקה",
    CHAPTER_CORPORATE_GOVERNANCE: "ממשל תאגידי",
    CHAPTER_CUSTOMER_OBLIGATIONS: "התחייבויות ללקוחות",
    CHAPTER_SUPPLIER_OBLIGATIONS: "התחייבויות לספקים",
    CHAPTER_CHANNEL_RESELLER_PARTNER: "ערוצי הפצה ושותפים",
    CHAPTER_HR: "משאבי אנוש",
    CHAPTER_REGULATORY: "רגולציה ורישוי",
    CHAPTER_LITIGATION: "התדיינויות וסיכונים",
    CHAPTER_TAXATION: "מיסוי",
    CHAPTER_FINANCIAL_DEBT: "חוב פיננסי",
    CHAPTER_INSURANCE: "ביטוח",
    CHAPTER_TECHNOLOGY_PRODUCT: "מחויבויות טכנולוגיה ומוצר",
    CHAPTER_IP_OWNERSHIP: "בעלות על קניין רוחני",
    CHAPTER_IP_LICENSING: "רישיונות קניין רוחני",
    CHAPTER_OSS: "קוד פתוח ורכיבי צד שלישי",
}


# --- Doc kinds the router may emit ----------------------------------------
# Best-effort single-label classification used for the File.doc_type column
# (for backward-compatibility with the finance-era tooling) alongside the
# per-document chapter_tags list the router also emits.

MA_DOC_KINDS: Final[tuple[str, ...]] = (
    # Transaction documents
    "spa",
    "apa",
    "loi",
    "term_sheet",
    "merger_agreement",
    "disclosure_schedule",
    "escrow_agreement",
    "side_letter",
    # Corporate governance
    "cap_table",
    "board_resolutions",
    "shareholders_agreement",
    "articles_of_association",
    # Customer contracts
    "customer_contract",
    "msa",
    "sow",
    "order_form",
    "dpa",
    "security_addendum",
    # Channel / reseller / partner
    "reseller_agreement",
    "distribution_agreement",
    "referral_agreement",
    "oem_agreement",
    "partnership_agreement",
    # Supplier / vendor
    "supplier_contract",
    # IP
    "ip_assignment",
    "license_agreement",
    "joint_development_agreement",
    # OSS
    "oss_inventory",
    "sbom",
    "oss_policy",
    # HR
    "employment_agreement",
    "change_in_control_agreement",
    "non_compete_agreement",
    # Other
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
