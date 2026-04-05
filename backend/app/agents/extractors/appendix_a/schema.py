"""Appendix A (נספח א') extractor schemas — Credit Committee materials only.

Structured facts for downstream rules + document generation. No legal prose,
clause selection, or non-committee sources in the agent contract.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field

from app.agents.schemas import EvidentiaryReference


class AppendixATransactionProjectType(str, Enum):
    """High-level project / works characterization when stated in committee docs."""

    REINFORCEMENT_AND_STRENGTHENING = "reinforcement_and_strengthening"
    DEMOLITION_AND_REBUILD = "demolition_and_rebuild"
    OTHER = "other"


class AppendixAPartyRole(str, Enum):
    """Counterparty / party role for Appendix A composition."""

    LENDER = "lender"
    INSURER = "insurer"
    DEVELOPER = "developer"
    GUARANTOR = "guarantor"
    CONTRACTOR = "contractor"
    OTHER = "other"


class AppendixAExecutionModelType(str, Enum):
    """How construction / execution is organized."""

    CONTRACTOR = "contractor"
    SELF_PERFORM = "self_perform"
    OTHER = "other"


class AppendixAFieldIssueType(str, Enum):
    """Structured quality signal for downstream review."""

    MISSING = "missing"
    AMBIGUOUS = "ambiguous"
    CONFLICT = "conflict"


class AppendixAProjectMeta(BaseModel):
    """Transaction and project characterization from committee materials."""

    transaction_project_type: AppendixATransactionProjectType | None = Field(
        default=None,
        description=(
            "Reinforcement/strengthening vs demolition-rebuild vs other, "
            "only if explicitly stated or clearly implied in committee docs"
        ),
    )
    transaction_project_type_source: EvidentiaryReference | None = None

    project_type_description_he: str | None = Field(
        default=None,
        description="Hebrew label for project type as written (e.g. תמ״א 38, פינוי בינוי)",
    )
    project_type_description_source: EvidentiaryReference | None = None

    project_summary_he: str | None = Field(
        default=None,
        description="Short Hebrew summary of the project scope from committee materials",
    )
    project_summary_source: EvidentiaryReference | None = None

    committee_reference_he: str | None = Field(
        default=None,
        description="Committee decision / reference number or title if stated",
    )
    committee_reference_source: EvidentiaryReference | None = None

    committee_date: str | None = Field(
        default=None,
        description="Committee approval or decision date YYYY-MM-DD if stated",
    )
    committee_date_source: EvidentiaryReference | None = None


class AppendixAParty(BaseModel):
    """Named party relevant to Appendix A (lender, insurer, developer, guarantors, etc.)."""

    name_he: str = Field(description="Party name as stated in Hebrew")
    role: AppendixAPartyRole = Field(description="Role for downstream clause mapping")
    id_number: str | None = Field(
        default=None, description="Israeli ID or equivalent if stated"
    )
    company_registration_number: str | None = Field(
        default=None, description="ח.פ. / company number if stated"
    )
    address_he: str | None = Field(default=None, description="Address in Hebrew if stated")
    notes_he: str | None = Field(
        default=None, description="Additional identifying details from the document"
    )
    source: EvidentiaryReference = Field(
        description="Evidence for this party row (box_2d required in VG mode)"
    )


class AppendixARealEstateDetails(BaseModel):
    """Parcel, address, and building characterization from committee materials."""

    address_he: str | None = None
    address_source: EvidentiaryReference | None = None

    gush: str | None = Field(default=None, description="Block (גוש)")
    helka: str | None = Field(default=None, description="Parcel (חלקה)")
    sub_parcel_he: str | None = Field(default=None, description="תת-חלקה if stated")
    parcel_source: EvidentiaryReference | None = None

    existing_building_description_he: str | None = Field(
        default=None,
        description="Existing building / use as described in committee docs",
    )
    existing_building_source: EvidentiaryReference | None = None

    new_building_description_he: str | None = Field(
        default=None,
        description="Planned new building / program if stated",
    )
    new_building_source: EvidentiaryReference | None = None

    land_area_sqm: float | None = None
    built_area_sqm: float | None = None
    residential_units_count: int | None = None
    area_units_source: EvidentiaryReference | None = None


class AppendixAFeeLine(BaseModel):
    """Fee or charge mentioned in committee materials."""

    fee_description_he: str = Field(description="Fee name / description in Hebrew")
    amount_ils: float | None = None
    fee_basis_he: str | None = Field(
        default=None, description="How the fee is calculated if stated"
    )
    source: EvidentiaryReference = Field(description="Evidence for this fee")


class AppendixAFinancialStructure(BaseModel):
    """Credit framework, pricing, repayment, and material financing constraints."""

    max_credit_framework_ils: float | None = None
    max_credit_framework_source: EvidentiaryReference | None = None

    policy_framework_ils: float | None = Field(
        default=None,
        description="Policy / envelope limit if distinct from approved facility",
    )
    policy_framework_source: EvidentiaryReference | None = None

    approved_tranche_ils: float | None = Field(
        default=None,
        description="Specific tranche approved if stated separately",
    )
    approved_tranche_source: EvidentiaryReference | None = None

    interest_terms_he: str | None = Field(
        default=None,
        description="Interest: margin, prime linkage, fixed/floating, as stated",
    )
    interest_terms_source: EvidentiaryReference | None = None

    repayment_terms_he: str | None = Field(
        default=None,
        description="Repayment schedule, balloon, grace, as stated",
    )
    repayment_terms_source: EvidentiaryReference | None = None

    profitability_threshold_he: str | None = Field(
        default=None,
        description="Profit / margin / coverage thresholds if stated",
    )
    profitability_threshold_source: EvidentiaryReference | None = None

    fees: list[AppendixAFeeLine] = Field(default_factory=list)
    material_constraints_he: list[str] = Field(
        default_factory=list,
        description="Material financing constraints as short Hebrew bullets",
    )
    material_constraints_sources: list[EvidentiaryReference] = Field(
        default_factory=list,
        description="One or more refs supporting the constraints list",
    )


class AppendixAGuaranteeType(str, Enum):
    """Normalized guarantee categories; use OTHER with free text when needed."""

    PERSONAL = "personal"
    CORPORATE = "corporate"
    BANK = "bank"
    PARENT_COMPANY = "parent_company"
    RENTAL = "rental"
    PURCHASE_LAW = "purchase_law"
    PERFORMANCE = "performance"
    MORTGAGE = "mortgage"
    PLEDGE = "pledge"
    INSURANCE = "insurance"
    OTHER = "other"


class AppendixAGuarantee(BaseModel):
    """Single guarantee or security package line from committee materials."""

    guarantee_type: AppendixAGuaranteeType
    guarantee_type_label_he: str | None = Field(
        default=None,
        description="Original Hebrew label from document when type is OTHER or for audit",
    )
    exists: bool = Field(
        description="True if committee states this guarantee exists / required",
    )
    amount_ils: float | None = None
    purpose_he: str | None = Field(
        default=None, description="Purpose or scope of the guarantee"
    )
    limitations_he: str | None = Field(
        default=None, description="Caps, expiry, conditions on the guarantee"
    )
    applicability_context_he: str | None = Field(
        default=None,
        description=(
            "If guarantee applies only under conditions (e.g. project type), "
            "extract that wording — do not resolve whether it applies"
        ),
    )
    source: EvidentiaryReference = Field(description="Primary evidence for this guarantee")


class AppendixAEquityStage(BaseModel):
    """Staged equity, triggers, pre-sales, or reductions."""

    stage_label_he: str | None = Field(
        default=None, description="Stage name or ordinal if stated"
    )
    required_equity_ils: float | None = None
    minimum_equity_ils: float | None = None
    trigger_condition_he: str | None = Field(
        default=None,
        description="Trigger for this stage (e.g. permit, sales threshold)",
    )
    pre_sale_requirement_he: str | None = Field(
        default=None,
        description="Pre-sale / marketing condition if stated",
    )
    reduction_amount_ils: float | None = Field(
        default=None,
        description="Reduction in required equity at this stage if stated",
    )
    source: EvidentiaryReference = Field(description="Evidence for this stage")


class AppendixAEquityStructure(BaseModel):
    """Equity stack and related financing conditions from committee materials."""

    equity_required_exists: bool = Field(
        default=False,
        description="True if committee explicitly addresses equity requirement",
    )
    required_equity_ils: float | None = None
    minimum_equity_ils: float | None = None
    developer_funded_equity_ils: float | None = None
    equity_amounts_source: EvidentiaryReference | None = None

    external_equity_completion_exists: bool | None = Field(
        default=None,
        description="True/False if external equity completion is addressed; null if not mentioned",
    )
    external_equity_completion_details_he: str | None = None
    external_equity_completion_source: EvidentiaryReference | None = None

    mezzanine_mentioned: bool | None = Field(
        default=None,
        description="Whether mezzanine or subordinated financing is mentioned",
    )
    mezzanine_details_he: str | None = None
    mezzanine_source: EvidentiaryReference | None = None

    surplus_from_other_projects_he: str | None = Field(
        default=None,
        description="Reliance on surplus from other projects if explicitly described",
    )
    surplus_from_other_projects_source: EvidentiaryReference | None = None

    stages: list[AppendixAEquityStage] = Field(default_factory=list)


class AppendixAConditionPrecedent(BaseModel):
    """Condition precedent for drawdown or effectiveness."""

    condition_text_he: str = Field(description="Condition text in Hebrew")
    category_he: str | None = Field(
        default=None,
        description="Optional category label from document (e.g. תנאי מתלה)",
    )
    is_stated_as_met: bool | None = Field(
        default=None,
        description="Whether the document states the condition is met, if applicable",
    )
    source: EvidentiaryReference = Field(description="Evidence for this condition")


class AppendixADisbursementCondition(BaseModel):
    """Material condition affecting disbursement beyond generic CPs."""

    condition_text_he: str = Field(description="Condition in Hebrew")
    source: EvidentiaryReference = Field(description="Evidence")


class AppendixAExecutionModel(BaseModel):
    """Contractor vs self-perform and related details."""

    model_type: AppendixAExecutionModelType | None = None
    contractor_name_he: str | None = None
    details_he: str | None = Field(
        default=None,
        description="Additional execution / construction model details",
    )
    source: EvidentiaryReference | None = Field(
        default=None,
        description="Evidence for execution model (required when model_type is non-null)",
    )


class AppendixAPermitStatus(BaseModel):
    """Permit and planning status as stated in committee materials."""

    permit_exists: bool | None = Field(
        default=None,
        description="Whether a building permit exists / approved, if addressed",
    )
    permit_number_he: str | None = None
    permit_date: str | None = Field(
        default=None,
        description="Permit date YYYY-MM-DD or partial if stated",
    )
    planning_status_he: str | None = Field(
        default=None,
        description="Planning / committee / appeal status in Hebrew",
    )
    source: EvidentiaryReference | None = None


class AppendixAMilestone(BaseModel):
    """Timeline milestone or key date from committee materials."""

    milestone_name_he: str = Field(description="Milestone label in Hebrew")
    target_date: str | None = Field(
        default=None,
        description="YYYY-MM-DD or partial (e.g. 2026-Q2) as stated",
    )
    duration_months: float | None = None
    condition_he: str | None = Field(
        default=None,
        description="Condition attached to the milestone if stated",
    )
    source: EvidentiaryReference = Field(description="Evidence")


class AppendixAAdditionalTerm(BaseModel):
    """Commercial, legal, or operational term needed for Appendix A composition."""

    term_description_he: str = Field(description="Term in Hebrew")
    category_he: str | None = Field(
        default=None,
        description="Loose category for rules engine (e.g. ביטוח, מכר)",
    )
    source: EvidentiaryReference = Field(description="Evidence")


class AppendixAFieldIssue(BaseModel):
    """Explicit missing / ambiguous / conflicting signals for downstream QA."""

    field_path: str = Field(
        description="JSON path or logical field id (e.g. equity_structure.required_equity_ils)"
    )
    issue_type: AppendixAFieldIssueType
    description_he: str = Field(description="Hebrew explanation for lawyers / reviewers")
    conflicting_values_he: list[str] = Field(
        default_factory=list,
        description="Each conflicting phrasing or value as extracted",
    )
    references: list[EvidentiaryReference] = Field(
        default_factory=list,
        description="Sources supporting the conflict or ambiguity",
    )


class AppendixAExtraction(BaseModel):
    """Structured Appendix A facts from Credit Committee documents only."""

    extraction_agent_version: str = Field(
        default="1",
        description="Schema / agent version for downstream compatibility",
    )

    project_meta: AppendixAProjectMeta | None = None
    parties: list[AppendixAParty] = Field(default_factory=list)
    real_estate: AppendixARealEstateDetails | None = None
    financial_structure: AppendixAFinancialStructure | None = None
    guarantees: list[AppendixAGuarantee] = Field(default_factory=list)
    equity_structure: AppendixAEquityStructure | None = None
    conditions_precedent: list[AppendixAConditionPrecedent] = Field(default_factory=list)
    disbursement_conditions: list[AppendixADisbursementCondition] = Field(
        default_factory=list
    )
    execution_model: AppendixAExecutionModel | None = None
    permit_status: AppendixAPermitStatus | None = None
    milestones: list[AppendixAMilestone] = Field(default_factory=list)
    additional_terms: list[AppendixAAdditionalTerm] = Field(default_factory=list)

    field_issues: list[AppendixAFieldIssue] = Field(
        default_factory=list,
        description="Missing, ambiguous, or conflicting fields — never silent",
    )
    notes: list[str] = Field(
        default_factory=list,
        description="Short Hebrew notes for human reviewers, not legal prose",
    )


__all__ = [
    "AppendixAAdditionalTerm",
    "AppendixAConditionPrecedent",
    "AppendixADisbursementCondition",
    "AppendixAEquityStage",
    "AppendixAEquityStructure",
    "AppendixAExecutionModel",
    "AppendixAExecutionModelType",
    "AppendixAExtraction",
    "AppendixAFieldIssue",
    "AppendixAFieldIssueType",
    "AppendixAFeeLine",
    "AppendixAFinancialStructure",
    "AppendixAGuarantee",
    "AppendixAGuaranteeType",
    "AppendixAMilestone",
    "AppendixAParty",
    "AppendixAPartyRole",
    "AppendixAPermitStatus",
    "AppendixAProjectMeta",
    "AppendixARealEstateDetails",
    "AppendixATransactionProjectType",
]
