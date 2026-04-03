"""Pydantic models for DD analysis — shared across all ADK agent types.

These mirror the frontend TypeScript types and define the structured output
that every specialized agent must produce (via ADK's ``output_schema``).
"""

from __future__ import annotations

from enum import Enum
from pydantic import BaseModel, Field
from typing import Literal


# ---------------------------------------------------------------------------
# Transaction type enum
# ---------------------------------------------------------------------------


class TransactionType(str, Enum):
    """Supported transaction types for due-diligence analysis."""

    REAL_ESTATE_FINANCE = "real_estate_finance"
    MA = "ma"
    COMPANY_INVESTMENT = "company_investment"

    @property
    def display_name_he(self) -> str:
        return _DISPLAY_NAMES_HE[self]

    @property
    def display_name_en(self) -> str:
        return _DISPLAY_NAMES_EN[self]


_DISPLAY_NAMES_HE: dict[TransactionType, str] = {
    TransactionType.REAL_ESTATE_FINANCE: 'מימון נדל"ן',
    TransactionType.MA: "מיזוגים ורכישות (M&A)",
    TransactionType.COMPANY_INVESTMENT: "השקעה בחברה",
}

_DISPLAY_NAMES_EN: dict[TransactionType, str] = {
    TransactionType.REAL_ESTATE_FINANCE: "Real Estate Finance",
    TransactionType.MA: "Mergers & Acquisitions",
    TransactionType.COMPANY_INVESTMENT: "Company Investment",
}


# ---------------------------------------------------------------------------
# Evidentiary Reference (אסמכתא ראייתית) — unified evidence for findings & timeline
# ---------------------------------------------------------------------------


class EvidentiaryReference(BaseModel):
    """אסמכתא ראייתית — mandatory structured evidence: source document, page, verbatim quote.

    Every Finding and every TimelineEvent is backed by at least one such reference.
    Used in extractors and in the report; report-level SourceRef adds locator fields.
    """

    source_document_name: str = Field(
        description="שם מסמך מקור — name of the source document"
    )
    page_number: int = Field(description="מספר עמוד — page number (1-indexed)")
    verbatim_quote: str = Field(
        description=(
            "ציטוט / תיאור הראיה — short Hebrew phrase describing the evidence. "
            "In visual grounding mode this is a human-readable label; "
            "in standard mode it should be an exact quote from the OCR text."
        )
    )
    box_2d: list[int] | None = Field(
        default=None,
        description=(
            "PRIMARY citation in visual grounding mode: pixel-precise bounding box "
            "[y_min, x_min, y_max, x_max] normalized 0-1000 locating the evidence "
            "on the PDF page. Omitted in standard (DocAI) pipeline."
        ),
    )


class BoundingBox(BaseModel):
    """Normalized bounding box (0-1) for a text region on a PDF page."""

    x0: float = Field(description="Left edge (0-1 normalized)")
    y0: float = Field(description="Top edge (0-1 normalized)")
    x1: float = Field(description="Right edge (0-1 normalized)")
    y1: float = Field(description="Bottom edge (0-1 normalized)")


class SourceRef(EvidentiaryReference):
    """Report-level citation: EvidentiaryReference + locator fields filled by citation locator."""

    start_index: int | None = Field(
        default=None,
        description="Optional 0-based start of the quote in the document text (with page markers).",
    )
    end_index: int | None = Field(
        default=None,
        description="Optional 0-based end of the quote in the document text.",
    )
    bounding_boxes: list[BoundingBox] = Field(
        default_factory=list,
        description="Normalized bounding boxes for the quote on the page. Populated by citation locator.",
    )


# ---------------------------------------------------------------------------
# Report sub-models
# ---------------------------------------------------------------------------


class IllegibleSection(BaseModel):
    page: int = Field(description="Page number where the illegible section appears")
    description: str = Field(description="Description of what could not be read")


class ExecutiveSummary(BaseModel):
    risk_level: Literal["high", "medium", "low"] = Field(
        description="Overall risk level for this transaction"
    )
    summary: str = Field(description="Executive summary in Hebrew")


class TimelineEvent(BaseModel):
    date: str = Field(description="Date of the event in YYYY-MM-DD format")
    event_description: str = Field(description="Description of the event in Hebrew")
    source: SourceRef = Field(description="Source citation for this event")


class Finding(BaseModel):
    id: str = Field(description="Unique finding identifier, e.g. finding-001")
    category: Literal[
        "lien",
        "ownership",
        "zoning",
        "corporate",
        "identity",
        "financial",
        "legal",
        "addendum",
        "regulatory",
        "other",
    ] = Field(description="Category of the finding")
    severity: Literal["critical", "warning", "info"] = Field(
        description="Severity level of the finding"
    )
    title: str = Field(description="Short title of the finding in Hebrew")
    description: str = Field(description="Detailed description in Hebrew")
    sources: list[SourceRef] = Field(
        min_length=1,
        description="אסמכתאות ראייתיות — at least one Evidentiary Reference (source_document_name, page_number, verbatim_quote) supporting this finding.",
    )
    cross_references: list[str] = Field(
        default_factory=list,
        description="IDs of related findings, e.g. ['finding-002']",
    )


class DocumentAnalyzed(BaseModel):
    name: str = Field(description="Original filename of the document")
    type: Literal[
        "tabu",
        "tama",
        "zero_report",
        "corporate_protocol",
        "id",
        "lien",
        "financial_statement",
        "shareholder_agreement",
        "board_resolution",
        "valuation_report",
        "legal_opinion",
        "regulatory_filing",
        "other",
    ] = Field(description="Document type classification")
    page_count: int = Field(description="Number of pages in the document")
    handwritten_notes_detected: bool = Field(
        description="Whether handwritten notes were detected"
    )
    illegible_sections: list[IllegibleSection] = Field(
        default_factory=list,
        description="List of sections that could not be read",
    )


class DDReport(BaseModel):
    """The complete due diligence analysis report.

    Used as ``output_schema`` for every ADK agent so the LLM returns
    structured JSON matching this exact shape.
    """

    transaction_type: TransactionType = Field(
        description="The transaction type this report was generated for"
    )
    executive_summary: ExecutiveSummary
    timeline: list[TimelineEvent] = Field(
        description="Chronological timeline of events found in the documents"
    )
    findings: list[Finding] = Field(
        description="All findings from the analysis, each with source citations"
    )
    documents_analyzed: list[DocumentAnalyzed] = Field(
        description="Metadata about each document that was analyzed"
    )


# ---------------------------------------------------------------------------
# Real Estate Finance schema (מימון נדל״ן)
# ---------------------------------------------------------------------------


class ProjectHeader(BaseModel):
    """Project metadata — populated by the application layer, not the agent.

    The agent must set these fields to null; they are filled in server-side
    from the Project DB record before delivering the report to the frontend.
    """

    project_name: str | None = Field(default=None, description="Project / deal name")
    client_name: str | None = Field(default=None, description="Client name")
    status: str | None = Field(default=None, description="Project status")
    created_at: str | None = Field(
        default=None, description="Project creation timestamp (ISO 8601)"
    )
    doc_count: int | None = Field(
        default=None, description="Number of documents uploaded"
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


class ZeroReportMetrics(BaseModel):
    """Financials extracted from the Zero Report (דו״ח אפס) for the lender."""

    addressee: str | None = Field(
        default=None,
        description='Party the report is addressed to (נמען הדו"ח)',
    )
    profit_on_turnover: float | None = Field(
        default=None,
        description="Profit on Turnover — רווח למחזור = (Revenue − Cost) / Revenue",
    )
    profit_on_cost: float | None = Field(
        default=None,
        description="Profit on Cost — רווח לעלות = (Revenue − Cost) / Cost",
    )
    construction_restrictions: list[str] = Field(
        default_factory=list,
        description=(
            "Physical / planning constraints found in the report: "
            "antiquities (עתיקות), preservation (שימור), unique engineering constraints, etc."
        ),
    )
    indexation_details: str | None = Field(
        default=None,
        description=(
            "Indexation summary (הצמדה למדד): index name, base date, mechanism. "
            "Set to 'אין התייחסות למדד בדו\"ח האפס' when not mentioned."
        ),
    )
    zero_report_date_formatted: str | None = Field(
        default=None,
        description=(
            'Formatted zero report issue date: "תאריך הוצאת דו"ח האפס הוא ביום DD/MM/YY". '
            "Derived from zero_report_extraction.report_date."
        ),
    )
    developer_entity_change: DeveloperEntityChange | None = Field(
        default=None,
        description=(
            "Change in developer entity/ownership detected in the zero report "
            "(original_developer, current_developer, change_details). Null if none."
        ),
    )


class FinanceCheck(BaseModel):
    """Lender-facing cross-document compliance checks."""

    lender_definition_match: bool | None = Field(
        default=None,
        description="Does the agreement allow the actual financing body (e.g. Investment Fund)?",
    )
    discrepancy_note: str | None = Field(
        default=None,
        description="Hebrew description of any lender-definition mismatch",
    )
    equity_confirmed: bool | None = Field(
        default=None,
        description="Whether equity is confirmed by a CPA certificate or Supervisor",
    )


class CompoundState(BaseModel):
    """Pre / post build state (buildings + apartments) for the complex."""

    building_count: int | None = Field(default=None, description="Number of buildings")
    apartment_count: int | None = Field(
        default=None, description="Number of apartments / residential units"
    )


class CompoundDetails(BaseModel):
    """Real Estate DD: complex/compound details (מתחם)."""

    address: str | None = Field(default=None, description="Address in Hebrew")
    gush: str | None = Field(default=None, description="Parcel block (גוש)")
    helka: str | None = Field(default=None, description="Parcel number (חלקה)")
    incoming_state: CompoundState | None = Field(
        default=None, description="State before demolition (ערב ההריסה)"
    )
    outgoing_state: CompoundState | None = Field(
        default=None, description="State after construction (לאחר הבנייה)"
    )
    discrepancy_note: str | None = Field(
        default=None,
        description="Cross-reference status: 'אין פער' or 'קיים פער: ___'",
    )


class TenantRow(BaseModel):
    """Real Estate DD: tenant/owner signature & registry status row."""

    helka: str | None = Field(default=None, description="Helka (חלקה) if stated")
    sub_parcel: str | None = Field(
        default=None, description="Sub-parcel identifier (תת-חלקה)"
    )
    owner_name: str | None = Field(default=None, description="Owner name (שם בעלים)")
    is_signed: bool | None = Field(
        default=None, description="Whether owner signed the agreement"
    )
    date_signed: str | None = Field(default=None, description="YYYY-MM-DD")
    is_warning_note_registered: bool | None = Field(
        default=None, description="הערת אזהרה לטובת היזם"
    )
    restrictive_note_registered: bool | None = Field(
        default=None, description="הערה מגבילה בנסח הטאבו"
    )
    is_mortgage_registered: bool | None = Field(
        default=None, description="Whether a mortgage is registered on this parcel"
    )
    notes: str | None = Field(
        default=None,
        description=(
            "Free-text notes in Hebrew: name-matching gaps, מסמך מגשר findings, "
            "third-party interest notes, missing warning-note alerts, etc."
        ),
    )


class DeveloperSignature(BaseModel):
    """Real Estate DD: developer signature details."""

    developer_signed_date: str | None = Field(default=None, description="YYYY-MM-DD")
    authorized_signatory_name: str | None = Field(
        default=None, description="Name of the authorized signatory"
    )
    authorized_signatory_id: str | None = Field(
        default=None, description="ID number if stated"
    )
    signing_protocol_authorized: bool | None = Field(
        default=None,
        description=(
            "Cross-reference result: true = protocol confirms authority; "
            "false = mismatch found; null = protocol not provided"
        ),
    )


class PowerOfAttorney(BaseModel):
    """Real Estate DD: attorneys / representatives."""

    developer_attorney: str | None = Field(default=None, description="בא כוח היזם")
    owners_attorney: str | None = Field(default=None, description="בא כוח הבעלים")


class UpgradeDowngradeInfo(BaseModel):
    """Tenant apartment upgrade / downgrade rights from the project agreement."""

    upgrade_allowed: bool | None = Field(
        default=None,
        description="Whether tenants may upgrade their replacement apartment",
    )
    upgrade_details: str | None = Field(
        default=None,
        description="Conditions / mechanism / pricing for upgrade",
    )
    downgrade_allowed: bool | None = Field(
        default=None,
        description="Whether tenants may downgrade their replacement apartment",
    )
    downgrade_details: str | None = Field(
        default=None,
        description="Conditions / compensation mechanism for downgrade",
    )


class ContractualMilestone(BaseModel):
    """A single contractual project milestone from the project agreement."""

    milestone: str = Field(description="Milestone name in Hebrew (e.g. הגשת בקשה להיתר)")
    deadline_or_condition: str = Field(
        description="Deadline, duration, or condition as stated in the agreement"
    )
    actual_status: str | None = Field(
        default=None,
        description=(
            "Actual date from permit (YYYY-MM-DD) or status note "
            "(e.g. 'לא הועלה היתר בנייה'). Populated during milestone cross-reference."
        ),
    )
    source: SourceRef | None = Field(default=None, description="Evidentiary reference")


class FinancingBody(BaseModel):
    """Real Estate DD: financing entity details."""

    lender_definition_clause: str | None = Field(
        default=None, description='Agreement definition for "lending bank" / "lender"'
    )
    actual_lender: str | None = Field(
        default=None, description="Actual financing body in practice"
    )
    lender_compliance_note: str | None = Field(
        default=None,
        description="Compliance status: 'המממן תואם להגדרות ההסכם' or red-flag description",
    )
    mezzanine_loan_exists: bool | None = Field(
        default=None, description="Whether mezzanine financing exists"
    )
    mezzanine_loan_details: str | None = Field(
        default=None,
        description="Mezzanine details: restrictions, required consents, in Hebrew",
    )


# ---------------------------------------------------------------------------
# UBO graph — for ownership visualization (nodes + edges)
# ---------------------------------------------------------------------------


class UboNode(BaseModel):
    """Single node in the UBO ownership graph (company or natural person)."""

    id: str = Field(
        description="Stable unique id for graph linking (e.g. company_123, person_456)"
    )
    name: str = Field(description="Display name in Hebrew")
    type: Literal["company", "person"] = Field(
        description="company = legal entity, person = natural person (ultimate owner)"
    )
    company_number: str | None = Field(
        default=None,
        description="Companies Registrar number (only when type=company)",
    )
    id_number: str | None = Field(
        default=None,
        description="Israeli ID number (only when type=person)",
    )


class UboEdge(BaseModel):
    """Ownership edge: from_id (owner) holds share_pct in to_id (company)."""

    from_id: str = Field(description="Node id of the owner (shareholder)")
    to_id: str = Field(description="Node id of the company owned")
    share_pct: str | None = Field(
        default=None,
        description="Share percentage as stated (e.g. 100%, 50%)",
    )


class UboGraph(BaseModel):
    """Graph of ownership: nodes (entities) and edges (who holds what in whom)."""

    nodes: list[UboNode] = Field(
        default_factory=list,
        description="All entities (companies and natural persons) in the ownership chain",
    )
    edges: list[UboEdge] = Field(
        default_factory=list,
        description="Ownership links: from_id holds share_pct in to_id. Root company is only as to_id.",
    )


class RealEstateFinanceDDReport(BaseModel):
    """Structured report for Real Estate Finance DD (מימון נדל״ן).

    Three-tier structure:
    - **Tier A** — Project header (populated server-side from the DB record).
    - **Tier B** — Deal narrative: executive summary, timeline, compound details,
      tenant table, legal representation, financing body.
    - **Tier C** — Lender analytics: zero-report metrics, compliance checks,
      UBO chain, risk flags, and structured findings.
    """

    # --- Tier A: Project header (server-populated) ---
    project_header: ProjectHeader | None = Field(
        default=None,
        description="Project metadata — filled server-side, agent must leave null",
    )

    # ---------------------------------------------------------------------------
    # All scalar / small-object fields come FIRST so the model generates them
    # before the two expensive variable-length lists (tenant_table, findings)
    # consume the token budget.
    # ---------------------------------------------------------------------------

    # --- Tier B: Deal narrative (non-list fields) ---
    executive_summary: ExecutiveSummary
    timeline: list[TimelineEvent] = Field(
        description="Chronological timeline of deal events found in the documents"
    )
    compound_details: CompoundDetails | None = Field(
        default=None, description="פרטי המתחם"
    )
    developer_signature: DeveloperSignature | None = None
    power_of_attorney: PowerOfAttorney | None = None
    financing: FinancingBody | None = None

    # --- Direct-copy fields from extractors ---
    contractual_milestones: list[ContractualMilestone] = Field(
        default_factory=list,
        description="Contractual project milestones from the agreement (לוח זמנים חוזי)",
    )
    upgrade_downgrade: UpgradeDowngradeInfo | None = Field(
        default=None,
        description="Tenant rights to upgrade or downgrade their replacement apartment",
    )

    # --- Tier C: Lender analytics (all small/medium fields) ---
    zero_report_metrics: ZeroReportMetrics | None = Field(
        default=None,
        description="Financials from the Zero Report (profitability, restrictions, indexation)",
    )
    signing_percentage: float = Field(
        default=0.0,
        description="Percentage of Tabu owners who signed the agreement (0–1 decimal)",
    )
    developer_ubo_chain: list[str] = Field(default_factory=list)
    developer_ubo_graph: UboGraph | None = Field(
        default=None,
        description="Structured UBO graph (nodes + edges) for ownership visualization",
    )
    high_risk_flags: list[str] = Field(
        default_factory=list,
        description="Items threatening loan repayment — must be actionable and cited",
    )

    # ---------------------------------------------------------------------------
    # Expensive variable-length lists — kept LAST so all fields above are
    # guaranteed to be generated within the token budget.
    # ---------------------------------------------------------------------------
    tenant_table: list[TenantRow] = Field(default_factory=list)
    tenant_table_signing_sources: list[SourceRef] = Field(
        default_factory=list,
        description="אסמכתא אחת לאחוז חתימות על ההסכם — מקור: הסכם פרויקט בלבד (טבלת חתימות/עמוד ציטוט).",
    )
    tenant_table_warning_note_sources: list[SourceRef] = Field(
        default_factory=list,
        description="אסמכתא אחת לאחוז הערות אזהרה ליזם — מקור: נסח טאבו בלבד (עמוד/ציטוט).",
    )
    findings: list[Finding] = Field(
        default_factory=list,
        description="ממצאי הדו״ח (מובנים) — כל ממצא עם אסמכתא ראייתית חובה (source_document_name, page_number, verbatim_quote)",
    )


class SynthesisMainOutput(BaseModel):
    """Part 1 — all scalar / small-object fields (fast, token-light)."""

    executive_summary: ExecutiveSummary
    timeline: list[TimelineEvent] = Field(
        default_factory=list,
        description="Chronological timeline of factual deal events",
    )
    compound_details: CompoundDetails | None = None
    developer_signature: DeveloperSignature | None = None
    power_of_attorney: PowerOfAttorney | None = None
    financing: FinancingBody | None = None
    contractual_milestones: list[ContractualMilestone] = Field(
        default_factory=list,
        description="Contractual project milestones from the agreement (לוח זמנים חוזי)",
    )
    upgrade_downgrade: UpgradeDowngradeInfo | None = None
    zero_report_metrics: ZeroReportMetrics | None = None
    signing_percentage: float = Field(
        default=0.0,
        description="Fraction of Tabu owners who signed (0–1)",
    )
    developer_ubo_chain: list[str] = Field(default_factory=list)
    developer_ubo_graph: UboGraph | None = None
    high_risk_flags: list[str] = Field(default_factory=list)
    tenant_table_signing_sources: list[SourceRef] = Field(
        default_factory=list,
        description="One evidentiary ref for signing percentage — project agreement only",
    )
    tenant_table_warning_note_sources: list[SourceRef] = Field(
        default_factory=list,
        description="One evidentiary ref for warning-note percentage — Tabu only",
    )


class SynthesisTenantFindingsOutput(BaseModel):
    """Part 2 — the two large variable-length lists (token-heavy)."""

    tenant_table: list[TenantRow] = Field(default_factory=list)
    findings: list[Finding] = Field(
        default_factory=list,
        description="All structured findings with mandatory evidentiary citations",
    )


# ---------------------------------------------------------------------------
# Document classifier schema
# ---------------------------------------------------------------------------


class DocumentClassificationResult(BaseModel):
    """Output of the Flash classifier agent.

    Maps each uploaded filename to one of the 9 known doc-type labels so that
    each extractor's before_model_callback can filter the file list it receives.
    """

    classifications: dict[str, str] = Field(
        description=(
            "Maps each filename (exactly as it appears in the document manifest) "
            "to its doc_type label. "
            "Valid labels: tabu | project_agreement | agreement_additions | "
            "zero_report | credit_committee | company_docs | signing_protocol | "
            "planning_permit | pledges_registry | other"
        )
    )


# ---------------------------------------------------------------------------
# QA / Judge agent schemas (GER-Eval)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# QA / Judge agent schemas (GER-Eval) — continued
# ---------------------------------------------------------------------------


class QACriterionScore(BaseModel):
    """Score for a single rubric criterion evaluated by the Judge agent."""

    criterion_id: str = Field(
        description="Rubric criterion key, e.g. 'signing_percentage'"
    )
    criterion_name: str = Field(description="Human-readable name of the criterion")
    passed: bool = Field(
        description="Whether the report meets this criterion's legal threshold"
    )
    confidence: float = Field(
        description="Judge's confidence in this assessment (0.0–1.0)",
        ge=0.0,
        le=1.0,
    )
    reasoning: str = Field(
        description="Brief English explanation of why the criterion passed or failed"
    )


class QAValidationReport(BaseModel):
    """Structured output from the Judge agent auditing a DD report.

    Implements the GER-Eval framework: the Judge evaluates the initial
    report against a rubric and produces an approval decision with
    per-criterion scores and Hebrew-language corrections.
    """

    is_approved: bool = Field(
        description=(
            "True if ALL criteria passed and the report is fit for delivery. "
            "False if any criterion failed."
        )
    )
    scores: list[QACriterionScore] = Field(
        description="Per-criterion evaluation scores"
    )
    corrections_he: list[str] = Field(
        description=(
            "Hebrew-language correction instructions for the reviewing lawyer. "
            "Empty when is_approved is True."
        )
    )
