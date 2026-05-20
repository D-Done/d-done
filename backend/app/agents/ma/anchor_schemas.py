"""M&A anchor extraction schemas — one Pydantic model per anchor spec.

Each model defines the per-chapter structured extraction that chapter agents
embed alongside their standard ChapterOutput fields. Evidence uses
EvidentiaryReference (with optional box_2d) since chapter agents run in
visual-grounding mode against GCS PDF URIs.

Naming convention: two-letter prefix per anchor to avoid name collisions.
  Co = Corporate & Ownership          (anchor 1)
  Td = Transaction Documents          (anchor 2)
  Cr = Customer Revenue Contracts     (anchor 3)
  Ch = Channel/Reseller/Partner       (anchor 4)
  Sv = Supplier & Critical Vendor     (anchor 5)
  Tp = Technology & Product           (anchor 6)
  Ip = IP Ownership & Transfers       (anchor 7)
  Il = IP Licensing                   (anchor 8)
  Os = OSS & Third-Party Components   (anchor 9)
  Em = Employment & Management        (anchor 10)
"""

from __future__ import annotations

from typing import Literal, Union

from pydantic import BaseModel, Field

from app.agents.schemas import EvidentiaryReference

# ---------------------------------------------------------------------------
# Shared type aliases
# ---------------------------------------------------------------------------

BoolOrUnknown = Union[bool, Literal["unknown"]]
NumOrUnknown = Union[float, Literal["unknown"]]


# ===========================================================================
# Anchor 1 — Corporate & Ownership
# ===========================================================================


class CoCompanyIdentity(BaseModel):
    legal_name: str = "unknown"
    other_names_in_document: list[str] = Field(default_factory=list)
    registration_number: str = "unknown"
    jurisdiction: str = "unknown"
    entity_type: str = "unknown"
    registered_address: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CoShareClass(BaseModel):
    share_class: str = "unknown"
    rights_summary: str = "unknown"
    par_value: str = "unknown"
    issued_or_outstanding: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CoShareCapital(BaseModel):
    authorized_share_capital: str = "unknown"
    issued_share_capital: str = "unknown"
    share_classes: list[CoShareClass] = Field(default_factory=list)


class CoCapTableHolder(BaseModel):
    holder_name: str = "unknown"
    holder_type: Literal["individual", "entity", "unknown"] = "unknown"
    share_class_or_security: str = "unknown"
    shares_or_units: NumOrUnknown = "unknown"
    ownership_percentage: NumOrUnknown = "unknown"
    voting_percentage: NumOrUnknown = "unknown"
    fully_diluted_basis_stated: BoolOrUnknown = "unknown"
    notes: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CoCapTable(BaseModel):
    exists_in_document: BoolOrUnknown = "unknown"
    holders: list[CoCapTableHolder] = Field(default_factory=list)


class CoEquityLinkedInstrument(BaseModel):
    instrument_type: Literal[
        "options", "warrants", "convertible_note", "safe", "preferred", "other", "unknown"
    ] = "unknown"
    holders_or_beneficiaries: str = "unknown"
    amount_or_pool_size: str = "unknown"
    key_terms: str = "unknown"
    change_of_control_effects: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CoTransferRestriction(BaseModel):
    restriction_type: Literal[
        "rofr", "rofo", "tag_along", "drag_along", "co_sale", "lockup",
        "consent_required", "prohibition", "other", "unknown",
    ] = "unknown"
    applies_to: Literal["shares", "securities", "assets", "unknown"] = "unknown"
    who_must_approve_or_benefits: str = "unknown"
    trigger_events: str = "unknown"
    process_summary: str = "unknown"
    exceptions: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CoProtectiveProvision(BaseModel):
    matter: str = "unknown"
    approval_holder_or_class: str = "unknown"
    threshold: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CoChangeOfControl(BaseModel):
    exists: BoolOrUnknown = "unknown"
    definition: str = "unknown"
    effects: str = "unknown"
    consent_or_approval_required: BoolOrUnknown = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CoTransferRestrictionsAndRights(BaseModel):
    shareholders_agreement_or_similar_referenced: BoolOrUnknown = "unknown"
    restrictions: list[CoTransferRestriction] = Field(default_factory=list)
    protective_provisions_and_vetoes: list[CoProtectiveProvision] = Field(default_factory=list)
    change_of_control: list[CoChangeOfControl] = Field(default_factory=list)


class CoGovernanceApproval(BaseModel):
    transaction_type: Literal[
        "sale_of_shares", "sale_of_assets", "merger", "issuance_of_securities",
        "financing", "related_party_transaction", "other", "unknown",
    ] = "unknown"
    approval_body: Literal[
        "board", "shareholders", "class_vote", "committee", "investor_consent", "other", "unknown"
    ] = "unknown"
    threshold: str = "unknown"
    quorum: str = "unknown"
    notes: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CoAuthorizedSignatory(BaseModel):
    signatory_name: str = "unknown"
    title_or_role: str = "unknown"
    signing_rule: str = "unknown"
    limitations_or_conditions: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CoInternalInconsistency(BaseModel):
    topic: Literal[
        "company_identity", "share_capital", "cap_table", "rights",
        "approvals", "signing_authority", "other", "unknown",
    ] = "unknown"
    description: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CorporateOwnershipExtraction(BaseModel):
    anchor_id: Literal["corporate_ownership"] = "corporate_ownership"
    executed_status: Literal["executed", "not_executed", "unknown"] = "unknown"
    company_identity: CoCompanyIdentity = Field(default_factory=CoCompanyIdentity)
    share_capital: CoShareCapital = Field(default_factory=CoShareCapital)
    cap_table: CoCapTable = Field(default_factory=CoCapTable)
    equity_linked_instruments: list[CoEquityLinkedInstrument] = Field(default_factory=list)
    transfer_restrictions_and_shareholder_rights: CoTransferRestrictionsAndRights = Field(
        default_factory=CoTransferRestrictionsAndRights
    )
    governance_approvals: list[CoGovernanceApproval] = Field(default_factory=list)
    authorized_signatories: list[CoAuthorizedSignatory] = Field(default_factory=list)
    internal_inconsistencies: list[CoInternalInconsistency] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)


# ===========================================================================
# Anchor 2 — Transaction Documents
# ===========================================================================


class TdDocumentProfile(BaseModel):
    document_type_detected: Literal[
        "loi", "term_sheet", "spa", "apa", "merger_agreement",
        "disclosure_schedule", "escrow_agreement", "holdback_agreement",
        "side_letter", "other", "unknown",
    ] = "unknown"
    binding_status: Literal["binding", "non_binding", "mixed", "unknown"] = "unknown"
    schedule_or_exhibit_id: str = "unknown"
    agreement_title: str = "unknown"
    date_of_agreement: str = "unknown"
    governing_law: str = "unknown"
    dispute_resolution: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdParty(BaseModel):
    name: str = "unknown"
    role: Literal[
        "buyer", "seller", "target", "shareholder", "guarantor", "escrow_agent", "other", "unknown"
    ] = "unknown"
    entity_type_if_stated: str = "unknown"
    jurisdiction_if_stated: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdDealStructure(BaseModel):
    transaction_type_as_stated: Literal[
        "share_purchase", "asset_purchase", "merger", "other", "unknown"
    ] = "unknown"
    acquired_interest_or_assets_description: str = "unknown"
    excluded_assets_or_excluded_liabilities: str = "unknown"
    parties: list[TdParty] = Field(default_factory=list)


class TdPurchasePrice(BaseModel):
    amount: str = "unknown"
    currency: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdPaymentStructure(BaseModel):
    cash_component: str = "unknown"
    equity_component: str = "unknown"
    rollover_component: str = "unknown"
    assumption_of_debt_or_liabilities: str = "unknown"
    notes: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdEarnOut(BaseModel):
    exists: BoolOrUnknown = "unknown"
    metrics_or_formula_description: str = "unknown"
    measurement_period: str = "unknown"
    payment_timing: str = "unknown"
    cap_floor_or_limits: str = "unknown"
    acceleration_triggers: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdWorkingCapitalAdjustment(BaseModel):
    exists: BoolOrUnknown = "unknown"
    definition_of_working_capital: str = "unknown"
    target_or_reference_amount: str = "unknown"
    calculation_method: str = "unknown"
    timeline_and_process: str = "unknown"
    dispute_mechanism: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdLockedBox(BaseModel):
    exists: BoolOrUnknown = "unknown"
    locked_box_date: str = "unknown"
    leakage_concept: str = "unknown"
    permitted_leakage: str = "unknown"
    interest_or_ticking_fee: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdOtherAdjustment(BaseModel):
    adjustment_type: str = "unknown"
    details: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdPurchasePriceAdjustments(BaseModel):
    working_capital_adjustment: TdWorkingCapitalAdjustment = Field(
        default_factory=TdWorkingCapitalAdjustment
    )
    locked_box: TdLockedBox = Field(default_factory=TdLockedBox)
    other_adjustments: list[TdOtherAdjustment] = Field(default_factory=list)


class TdEscrowOrHoldback(BaseModel):
    exists: BoolOrUnknown = "unknown"
    amount: str = "unknown"
    currency: str = "unknown"
    duration_or_release_date: str = "unknown"
    release_conditions: str = "unknown"
    claims_and_dispute_process: str = "unknown"
    escrow_agent_if_any: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdSetoffRights(BaseModel):
    exists: BoolOrUnknown = "unknown"
    details: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdConsideration(BaseModel):
    purchase_price: TdPurchasePrice = Field(default_factory=TdPurchasePrice)
    payment_structure: TdPaymentStructure = Field(default_factory=TdPaymentStructure)
    earn_out: TdEarnOut = Field(default_factory=TdEarnOut)
    purchase_price_adjustments: TdPurchasePriceAdjustments = Field(
        default_factory=TdPurchasePriceAdjustments
    )
    escrow_or_holdback: TdEscrowOrHoldback = Field(default_factory=TdEscrowOrHoldback)
    setoff_or_withholding_rights: TdSetoffRights = Field(default_factory=TdSetoffRights)


class TdCriticalDate(BaseModel):
    event: str = "unknown"
    date_or_deadline: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdClosingAndTimeline(BaseModel):
    signing_date: str = "unknown"
    closing_date_or_target: str = "unknown"
    outside_date_or_long_stop: str = "unknown"
    interim_period_obligations_summary: str = "unknown"
    closing_deliverables_summary: str = "unknown"
    flow_of_funds_summary: str = "unknown"
    critical_dates: list[TdCriticalDate] = Field(default_factory=list)
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdConditionPrecedent(BaseModel):
    condition_category: Literal[
        "regulatory_approval", "third_party_consent", "shareholder_approval",
        "financing", "no_mae", "bring_down", "deliverables", "no_injunction",
        "tax", "other", "unknown",
    ] = "unknown"
    condition_text_summary: str = "unknown"
    benefiting_party: Literal["buyer", "seller", "both", "unknown"] = "unknown"
    waiver_rights: str = "unknown"
    timing_or_deadline: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdPreClosingCovenant(BaseModel):
    covenant_category: Literal[
        "ordinary_course", "negative_covenant", "affirmative_covenant",
        "access_and_cooperation", "employee_matters", "customer_supplier_matters",
        "regulatory_filings", "other", "unknown",
    ] = "unknown"
    details: str = "unknown"
    consent_rights: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdTerminationRight(BaseModel):
    termination_trigger: Literal[
        "outside_date", "breach", "failure_of_condition", "mae",
        "no_approval", "mutual_agreement", "other", "unknown",
    ] = "unknown"
    who_can_terminate: Literal["buyer", "seller", "both", "unknown"] = "unknown"
    notice_or_process: str = "unknown"
    fees_or_costs: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdSpecificPerformance(BaseModel):
    addressed: BoolOrUnknown = "unknown"
    details: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdLiabilityLimitation(BaseModel):
    details: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdTerminationAndRemedies(BaseModel):
    transaction_termination_rights: list[TdTerminationRight] = Field(default_factory=list)
    specific_performance: TdSpecificPerformance = Field(default_factory=TdSpecificPerformance)
    limitation_of_liability_for_transaction_breaches: TdLiabilityLimitation = Field(
        default_factory=TdLiabilityLimitation
    )


class TdSurvivalPeriod(BaseModel):
    category: Literal[
        "general", "fundamental", "tax", "environmental", "employment", "ip", "other", "unknown"
    ] = "unknown"
    period: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdIndemnification(BaseModel):
    exists: BoolOrUnknown = "unknown"
    cap: str = "unknown"
    basket_or_deductible: str = "unknown"
    mini_basket: str = "unknown"
    escrow_backing: str = "unknown"
    exclusions_or_carveouts: str = "unknown"
    claims_process_summary: str = "unknown"
    sandbagging: Literal["pro_sandbagging", "anti_sandbagging", "silent", "unknown"] = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdRepsWarranties(BaseModel):
    reps_categories_listed: list[str] = Field(default_factory=list)
    survival_periods: list[TdSurvivalPeriod] = Field(default_factory=list)
    indemnification_structure: TdIndemnification = Field(default_factory=TdIndemnification)


class TdScheduleEntry(BaseModel):
    schedule_id: str = "unknown"
    topic: Literal[
        "material_contracts", "litigation", "ip", "employees", "regulatory",
        "tax", "real_estate", "data_privacy", "other", "unknown",
    ] = "unknown"
    items_listed_verbatim_or_near_verbatim: list[str] = Field(default_factory=list)
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TdDisclosureSchedules(BaseModel):
    schedules_present: BoolOrUnknown = "unknown"
    schedule_entries: list[TdScheduleEntry] = Field(default_factory=list)


class TdInternalInconsistency(BaseModel):
    topic: Literal[
        "deal_structure", "purchase_price", "timeline", "conditions_precedent",
        "termination", "indemnities", "other", "unknown",
    ] = "unknown"
    description: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TransactionDocumentsExtraction(BaseModel):
    anchor_id: Literal["transaction_documents"] = "transaction_documents"
    executed_status: Literal["executed", "not_executed", "unknown"] = "unknown"
    transaction_document_profile: TdDocumentProfile = Field(default_factory=TdDocumentProfile)
    deal_structure: TdDealStructure = Field(default_factory=TdDealStructure)
    consideration: TdConsideration = Field(default_factory=TdConsideration)
    closing_and_timeline: TdClosingAndTimeline = Field(default_factory=TdClosingAndTimeline)
    conditions_precedent: list[TdConditionPrecedent] = Field(default_factory=list)
    pre_closing_covenants: list[TdPreClosingCovenant] = Field(default_factory=list)
    termination_and_remedies: TdTerminationAndRemedies = Field(
        default_factory=TdTerminationAndRemedies
    )
    representations_warranties_and_indemnities: TdRepsWarranties = Field(
        default_factory=TdRepsWarranties
    )
    disclosure_schedules_and_exceptions: TdDisclosureSchedules = Field(
        default_factory=TdDisclosureSchedules
    )
    internal_inconsistencies: list[TdInternalInconsistency] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)


# ===========================================================================
# Anchor 3 — Customer Revenue Contracts
# ===========================================================================


class CrAmendsOrSupplements(BaseModel):
    exists: BoolOrUnknown = "unknown"
    amended_document_reference: str = "unknown"
    summary_of_changes: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrPrecedence(BaseModel):
    exists: BoolOrUnknown = "unknown"
    order_of_priority: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrParty(BaseModel):
    name: str = "unknown"
    role: Literal[
        "customer", "vendor", "processor", "controller", "subprocessor",
        "affiliate", "other", "unknown",
    ] = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrContractProfile(BaseModel):
    document_type_detected: Literal[
        "msa", "saas_agreement", "sow", "order_form", "renewal", "amendment",
        "side_letter", "dpa", "security_addendum", "other", "unknown",
    ] = "unknown"
    agreement_title: str = "unknown"
    effective_date: str = "unknown"
    order_or_sow_date: str = "unknown"
    term_start_date: str = "unknown"
    term_end_date: str = "unknown"
    amends_or_supplements: CrAmendsOrSupplements = Field(default_factory=CrAmendsOrSupplements)
    precedence: CrPrecedence = Field(default_factory=CrPrecedence)
    parties: list[CrParty] = Field(default_factory=list)
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrFeesAndPricing(BaseModel):
    pricing_model: Literal[
        "subscription", "usage_based", "per_user", "fixed_fee", "milestone", "other", "unknown"
    ] = "unknown"
    fee_amounts_or_rate_card: str = "unknown"
    currency: str = "unknown"
    invoicing_and_payment_terms: str = "unknown"
    taxes_and_withholding: str = "unknown"
    minimum_commitments: str = "unknown"
    discounts_or_volume_tiers: str = "unknown"
    true_up_or_overage: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrPriceChanges(BaseModel):
    vendor_can_increase_unilaterally: BoolOrUnknown = "unknown"
    increase_mechanism: Literal[
        "cpi_indexation", "fixed_uplift", "notice_based", "renegotiation", "other", "unknown"
    ] = "unknown"
    notice_period: str = "unknown"
    uplift_or_cap_details: str = "unknown"
    customer_price_protection: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrMfnAndBenchmarking(BaseModel):
    mfn_exists: BoolOrUnknown = "unknown"
    mfn_scope: Literal["pricing_only", "terms_and_pricing", "other", "unknown"] = "unknown"
    benchmarking_rights: BoolOrUnknown = "unknown"
    benchmarking_details: str = "unknown"
    most_favored_customer_definition: str = "unknown"
    remedy_if_triggered: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrCommercials(BaseModel):
    fees_and_pricing: CrFeesAndPricing = Field(default_factory=CrFeesAndPricing)
    price_changes: CrPriceChanges = Field(default_factory=CrPriceChanges)
    mfn_and_benchmarking: CrMfnAndBenchmarking = Field(default_factory=CrMfnAndBenchmarking)


class CrTermAndRenewal(BaseModel):
    initial_term: str = "unknown"
    auto_renew: BoolOrUnknown = "unknown"
    renewal_term: str = "unknown"
    non_renewal_notice_window: str = "unknown"
    evergreen: BoolOrUnknown = "unknown"
    renewal_pricing_uplift: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrTerminationForConvenience(BaseModel):
    by_customer: BoolOrUnknown = "unknown"
    by_vendor: BoolOrUnknown = "unknown"
    notice_period: str = "unknown"
    early_termination_fees_or_charges: str = "unknown"
    refunds_or_payment_obligations: str = "unknown"
    transition_assistance: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrTerminationForCause(BaseModel):
    grounds: list[str] = Field(default_factory=list)
    cure_period: str = "unknown"
    notice_requirements: str = "unknown"
    termination_for_nonpayment: str = "unknown"
    termination_for_insolvency: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrSuspensionRights(BaseModel):
    exists: BoolOrUnknown = "unknown"
    triggers: str = "unknown"
    notice_and_cure: str = "unknown"
    effects: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrTerminationAndSuspension(BaseModel):
    termination_for_convenience: CrTerminationForConvenience = Field(
        default_factory=CrTerminationForConvenience
    )
    termination_for_cause: CrTerminationForCause = Field(default_factory=CrTerminationForCause)
    suspension_rights: CrSuspensionRights = Field(default_factory=CrSuspensionRights)


class CrChangeOfControl(BaseModel):
    exists: BoolOrUnknown = "unknown"
    definition: str = "unknown"
    effects: str = "unknown"
    consent_required: BoolOrUnknown = "unknown"
    notice_required: BoolOrUnknown = "unknown"
    termination_right_triggered: BoolOrUnknown = "unknown"
    timing_requirements: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrAssignment(BaseModel):
    restricted: BoolOrUnknown = "unknown"
    consent_required: BoolOrUnknown = "unknown"
    by_operation_of_law_included: BoolOrUnknown = "unknown"
    merger_or_change_of_control_treated_as_assignment: BoolOrUnknown = "unknown"
    sale_of_substantially_all_assets_captured: BoolOrUnknown = "unknown"
    permitted_assignments_exceptions: str = "unknown"
    process_and_notice: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrChangeOfControlAndAssignment(BaseModel):
    change_of_control: CrChangeOfControl = Field(default_factory=CrChangeOfControl)
    assignment: CrAssignment = Field(default_factory=CrAssignment)


class CrSlaAndCredits(BaseModel):
    sla_exists: BoolOrUnknown = "unknown"
    sla_summary: str = "unknown"
    service_credits: str = "unknown"
    credits_cap_or_limits: str = "unknown"
    exclusions: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrAuditAndReporting(BaseModel):
    audit_rights_exist: BoolOrUnknown = "unknown"
    audit_scope: Literal["financial", "security", "compliance", "other", "unknown"] = "unknown"
    audit_process: str = "unknown"
    cost_allocation: str = "unknown"
    remediation_obligations: str = "unknown"
    reporting_obligations: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrLimitationOfLiability(BaseModel):
    exists: BoolOrUnknown = "unknown"
    cap_amount_or_formula: str = "unknown"
    cap_basis: Literal[
        "fees_paid", "fees_payable", "per_claim", "aggregate", "other", "unknown"
    ] = "unknown"
    excluded_damages: str = "unknown"
    carveouts: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrIndemnity(BaseModel):
    indemnity_type: Literal[
        "ip_infringement", "data_privacy", "bodily_injury_property",
        "third_party_claims", "other", "unknown",
    ] = "unknown"
    indemnifying_party: Literal["customer", "vendor", "mutual", "unknown"] = "unknown"
    scope_summary: str = "unknown"
    limitations_or_exclusions: str = "unknown"
    procedure_summary: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrLiabilityAndIndemnity(BaseModel):
    limitation_of_liability: CrLimitationOfLiability = Field(
        default_factory=CrLimitationOfLiability
    )
    indemnities: list[CrIndemnity] = Field(default_factory=list)


class CrDpaRoles(BaseModel):
    controller_processor_roles: str = "unknown"
    subprocessing_rules: str = "unknown"
    cross_border_transfers: str = "unknown"
    breach_notification_timing: str = "unknown"
    security_measures_summary: str = "unknown"
    data_retention_deletion: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrSecurityAddendum(BaseModel):
    present: BoolOrUnknown = "unknown"
    standards_or_certifications: str = "unknown"
    audit_or_pen_test_rights: str = "unknown"
    encryption_or_access_controls: str = "unknown"
    incident_response_obligations: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrDataProtectionAndSecurity(BaseModel):
    dpa_present: BoolOrUnknown = "unknown"
    roles: CrDpaRoles = Field(default_factory=CrDpaRoles)
    security_addendum: CrSecurityAddendum = Field(default_factory=CrSecurityAddendum)


class CrOperationalConstraints(BaseModel):
    exclusivity_or_non_compete: str = "unknown"
    most_significant_customer_friendly_terms: list[str] = Field(default_factory=list)
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CrInternalInconsistency(BaseModel):
    topic: Literal[
        "commercials", "term_and_renewal", "termination", "change_of_control",
        "assignment", "sla", "audit", "liability", "data", "other", "unknown",
    ] = "unknown"
    description: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class CustomerRevenueContractsExtraction(BaseModel):
    anchor_id: Literal["customer_revenue_contracts"] = "customer_revenue_contracts"
    executed_status: Literal["executed", "not_executed", "unknown"] = "unknown"
    contract_profile: CrContractProfile = Field(default_factory=CrContractProfile)
    commercials: CrCommercials = Field(default_factory=CrCommercials)
    term_and_renewal: CrTermAndRenewal = Field(default_factory=CrTermAndRenewal)
    termination_and_suspension: CrTerminationAndSuspension = Field(
        default_factory=CrTerminationAndSuspension
    )
    change_of_control_and_assignment: CrChangeOfControlAndAssignment = Field(
        default_factory=CrChangeOfControlAndAssignment
    )
    sla_and_credits: CrSlaAndCredits = Field(default_factory=CrSlaAndCredits)
    audit_and_reporting: CrAuditAndReporting = Field(default_factory=CrAuditAndReporting)
    liability_and_indemnity: CrLiabilityAndIndemnity = Field(
        default_factory=CrLiabilityAndIndemnity
    )
    data_protection_and_security: CrDataProtectionAndSecurity = Field(
        default_factory=CrDataProtectionAndSecurity
    )
    operational_constraints: CrOperationalConstraints = Field(
        default_factory=CrOperationalConstraints
    )
    internal_inconsistencies: list[CrInternalInconsistency] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)



# ===========================================================================
# Anchor 5 — Supplier & Critical Vendor Contracts
# ===========================================================================


class SvAmendsOrSupplements(BaseModel):
    exists: BoolOrUnknown = "unknown"
    amended_document_reference: str = "unknown"
    summary_of_changes: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SvPrecedence(BaseModel):
    exists: BoolOrUnknown = "unknown"
    order_of_priority: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SvParty(BaseModel):
    name: str = "unknown"
    role: Literal[
        "company", "supplier", "vendor", "subcontractor", "affiliate", "other", "unknown"
    ] = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SvContractProfile(BaseModel):
    document_type_detected: Literal[
        "supplier_agreement", "vendor_msa", "sow", "cloud_hosting",
        "payment_processor", "outsourcing", "professional_services",
        "manufacturing", "logistics", "other", "unknown",
    ] = "unknown"
    agreement_title: str = "unknown"
    effective_date: str = "unknown"
    term_start_date: str = "unknown"
    term_end_date: str = "unknown"
    services_or_goods: str = "unknown"
    criticality_indicators: str = "unknown"
    amends_or_supplements: SvAmendsOrSupplements = Field(default_factory=SvAmendsOrSupplements)
    precedence: SvPrecedence = Field(default_factory=SvPrecedence)
    parties: list[SvParty] = Field(default_factory=list)
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SvFeesAndPricing(BaseModel):
    pricing_model: Literal[
        "subscription", "usage_based", "per_unit", "fixed_fee",
        "time_and_materials", "milestone", "other", "unknown",
    ] = "unknown"
    fee_amounts_or_rate_card: str = "unknown"
    currency: str = "unknown"
    invoicing_and_payment_terms: str = "unknown"
    late_fees_interest: str = "unknown"
    taxes_and_withholding: str = "unknown"
    true_up_overage_volume_bands: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SvPriceChanges(BaseModel):
    supplier_can_increase_unilaterally: BoolOrUnknown = "unknown"
    increase_mechanism: Literal[
        "cpi_indexation", "fixed_uplift", "notice_based", "renegotiation", "other", "unknown"
    ] = "unknown"
    notice_period: str = "unknown"
    uplift_or_cap_details: str = "unknown"
    repricing_events: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SvMinimumCommitment(BaseModel):
    commitment_type: Literal[
        "take_or_pay", "mqc", "minimum_fees", "committed_spend",
        "reserved_capacity", "other", "unknown",
    ] = "unknown"
    amount_or_volume: str = "unknown"
    measurement_period: str = "unknown"
    true_up_or_shortfall_payment: str = "unknown"
    penalties_or_consequences: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SvCommercialTerms(BaseModel):
    fees_and_pricing: SvFeesAndPricing = Field(default_factory=SvFeesAndPricing)
    price_changes_and_repricing: SvPriceChanges = Field(default_factory=SvPriceChanges)
    minimum_commitments: list[SvMinimumCommitment] = Field(default_factory=list)


class SvStepInRights(BaseModel):
    exists: BoolOrUnknown = "unknown"
    details: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SvAuditInspectionRights(BaseModel):
    exists: BoolOrUnknown = "unknown"
    scope: Literal[
        "operational", "security", "compliance", "financial", "other", "unknown"
    ] = "unknown"
    details: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SvSlaPerformanceAndRemedies(BaseModel):
    sla_exists: BoolOrUnknown = "unknown"
    sla_summary: str = "unknown"
    service_credits: str = "unknown"
    penalties_or_liquidated_damages: str = "unknown"
    performance_guarantees: str = "unknown"
    step_in_or_substitution_rights: SvStepInRights = Field(default_factory=SvStepInRights)
    audit_inspection_rights: SvAuditInspectionRights = Field(
        default_factory=SvAuditInspectionRights
    )
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SvTermAndRenewal(BaseModel):
    initial_term: str = "unknown"
    auto_renew: BoolOrUnknown = "unknown"
    renewal_term: str = "unknown"
    non_renewal_notice_window: str = "unknown"
    lock_in_period: str = "unknown"
    evergreen: BoolOrUnknown = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SvTerminationForConvenience(BaseModel):
    exists: BoolOrUnknown = "unknown"
    who_can_terminate: Literal["company", "supplier", "both", "unknown"] = "unknown"
    notice_period: str = "unknown"
    early_termination_fees: str = "unknown"
    refunds_or_payment_obligations: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SvTerminationForCause(BaseModel):
    grounds: list[str] = Field(default_factory=list)
    cure_period: str = "unknown"
    notice_requirements: str = "unknown"
    termination_for_nonperformance: str = "unknown"
    termination_for_nonpayment: str = "unknown"
    termination_for_insolvency: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SvExitAndTransition(BaseModel):
    transition_assistance: str = "unknown"
    handover_deliverables: str = "unknown"
    continued_support_post_termination: str = "unknown"
    data_return_or_deletion: str = "unknown"
    source_code_escrow_or_release: str = "unknown"
    business_continuity_dr: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SvTerminationAndContinuity(BaseModel):
    termination_for_convenience: SvTerminationForConvenience = Field(
        default_factory=SvTerminationForConvenience
    )
    termination_for_cause: SvTerminationForCause = Field(default_factory=SvTerminationForCause)
    exit_and_transition: SvExitAndTransition = Field(default_factory=SvExitAndTransition)


class SvChangeOfControl(BaseModel):
    exists: BoolOrUnknown = "unknown"
    definition: str = "unknown"
    effects: str = "unknown"
    consent_required: BoolOrUnknown = "unknown"
    notice_required: BoolOrUnknown = "unknown"
    termination_right_triggered: BoolOrUnknown = "unknown"
    price_change_or_repricing_triggered: BoolOrUnknown = "unknown"
    timing_requirements: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SvAssignment(BaseModel):
    restricted: BoolOrUnknown = "unknown"
    consent_required: BoolOrUnknown = "unknown"
    by_operation_of_law_included: BoolOrUnknown = "unknown"
    merger_or_change_of_control_treated_as_assignment: BoolOrUnknown = "unknown"
    sale_of_substantially_all_assets_captured: BoolOrUnknown = "unknown"
    permitted_assignments_exceptions: str = "unknown"
    process_and_notice: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SvSubcontracting(BaseModel):
    restricted: BoolOrUnknown = "unknown"
    approval_required: BoolOrUnknown = "unknown"
    details: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SvChangeOfControlAndAssignment(BaseModel):
    change_of_control: SvChangeOfControl = Field(default_factory=SvChangeOfControl)
    assignment: SvAssignment = Field(default_factory=SvAssignment)
    subcontracting: SvSubcontracting = Field(default_factory=SvSubcontracting)


class SvKeyPersonnel(BaseModel):
    key_personnel_commitments: str = "unknown"
    replacement_rights: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SvInternalInconsistency(BaseModel):
    topic: Literal[
        "commercial_terms", "minimum_commitments", "sla", "term",
        "termination", "change_of_control", "assignment", "other", "unknown",
    ] = "unknown"
    description: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class SupplierCriticalVendorExtraction(BaseModel):
    anchor_id: Literal["supplier_critical_vendor_contracts"] = "supplier_critical_vendor_contracts"
    executed_status: Literal["executed", "not_executed", "unknown"] = "unknown"
    contract_profile: SvContractProfile = Field(default_factory=SvContractProfile)
    commercial_terms: SvCommercialTerms = Field(default_factory=SvCommercialTerms)
    sla_performance_and_remedies: SvSlaPerformanceAndRemedies = Field(
        default_factory=SvSlaPerformanceAndRemedies
    )
    term_and_renewal: SvTermAndRenewal = Field(default_factory=SvTermAndRenewal)
    termination_and_continuity: SvTerminationAndContinuity = Field(
        default_factory=SvTerminationAndContinuity
    )
    change_of_control_and_assignment: SvChangeOfControlAndAssignment = Field(
        default_factory=SvChangeOfControlAndAssignment
    )
    key_personnel_and_resources: SvKeyPersonnel = Field(default_factory=SvKeyPersonnel)
    internal_inconsistencies: list[SvInternalInconsistency] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)




class IpParty(BaseModel):
    name: str = "unknown"
    role: Literal[
        "assignor", "assignee", "developer", "client", "joint_owner", "other", "unknown"
    ] = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IpDocumentProfile(BaseModel):
    document_type_detected: Literal[
        "employee_invention_assignment", "contractor_ip_assignment",
        "ip_assignment_deed", "development_agreement",
        "joint_development_agreement", "ip_registration_extract",
        "ip_schedule", "other", "unknown",
    ] = "unknown"
    title: str = "unknown"
    effective_date: str = "unknown"
    parties: list[IpParty] = Field(default_factory=list)
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IpAsset(BaseModel):
    ip_type: Literal[
        "patent", "patent_application", "trademark", "design", "copyright",
        "software", "database_rights", "trade_secret", "know_how",
        "domain_name", "other", "unknown",
    ] = "unknown"
    asset_name_or_title: str = "unknown"
    identifier_numbers: str = "unknown"
    jurisdiction: str = "unknown"
    filing_or_registration_date: str = "unknown"
    scope_description: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IpOwnershipMechanics(BaseModel):
    assignment_language_type: Literal[
        "present_assignment", "future_assignment", "mixed", "unknown"
    ] = "unknown"
    assignment_scope: str = "unknown"
    works_made_for_hire_language: BoolOrUnknown = "unknown"
    further_assurances_obligation: BoolOrUnknown = "unknown"
    power_of_attorney: BoolOrUnknown = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IpLicenseBack(BaseModel):
    exists: BoolOrUnknown = "unknown"
    retained_rights_holder: str = "unknown"
    license_scope: str = "unknown"
    exclusivity: Literal["exclusive", "non_exclusive", "unknown"] = "unknown"
    field_of_use_or_limitations: str = "unknown"
    duration: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IpThirdPartyAndBackground(BaseModel):
    background_ip_referenced: BoolOrUnknown = "unknown"
    third_party_materials_referenced: BoolOrUnknown = "unknown"
    restrictions_or_obligations: str = "unknown"
    open_source_referenced: BoolOrUnknown = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IpMoralRights(BaseModel):
    addressed: BoolOrUnknown = "unknown"
    waiver_or_consent_summary: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IpConfidentiality(BaseModel):
    confidentiality_obligations: str = "unknown"
    trade_secret_protection_obligations: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IpJointDevelopment(BaseModel):
    exists: BoolOrUnknown = "unknown"
    ownership_allocation: str = "unknown"
    exploitation_rights: str = "unknown"
    prosecution_and_maintenance: str = "unknown"
    enforcement_rights: str = "unknown"
    accounting_or_royalties_between_parties: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IpInternalInconsistency(BaseModel):
    topic: Literal[
        "ip_assets", "assignment_mechanics", "retained_rights",
        "third_party_ip", "moral_rights", "joint_ownership", "other", "unknown",
    ] = "unknown"
    description: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IlIncorporationByReference(BaseModel):
    exists: BoolOrUnknown = "unknown"
    reference_details: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IlParty(BaseModel):
    name: str = "unknown"
    role: Literal[
        "licensor", "licensee", "sublicensor", "sublicensee", "escrow_agent", "other", "unknown"
    ] = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IlLicenseProfile(BaseModel):
    license_direction: Literal["inbound", "outbound", "mixed", "unknown"] = "unknown"
    document_type_detected: Literal[
        "software_license", "content_license", "database_license", "sdk_license",
        "oem_license", "ip_franchise", "sublicense", "other", "unknown",
    ] = "unknown"
    agreement_title: str = "unknown"
    effective_date: str = "unknown"
    term_start_date: str = "unknown"
    term_end_date: str = "unknown"
    auto_renew: BoolOrUnknown = "unknown"
    renewal_term: str = "unknown"
    parties: list[IlParty] = Field(default_factory=list)
    licensed_subject_matter: str = "unknown"
    incorporation_by_reference: IlIncorporationByReference = Field(
        default_factory=IlIncorporationByReference
    )
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IlSublicensing(BaseModel):
    permitted: BoolOrUnknown = "unknown"
    conditions: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IlAuditRights(BaseModel):
    exists: BoolOrUnknown = "unknown"
    details: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IlScopeAndRestrictions(BaseModel):
    field_of_use: str = "unknown"
    territory: str = "unknown"
    exclusivity: Literal["exclusive", "non_exclusive", "unknown"] = "unknown"
    sublicensing: IlSublicensing = Field(default_factory=IlSublicensing)
    distribution_oem_or_resale_rights: str = "unknown"
    modification_derivatives_restrictions: str = "unknown"
    usage_limits_or_metrics: str = "unknown"
    reporting_obligations: str = "unknown"
    audit_rights: IlAuditRights = Field(default_factory=IlAuditRights)
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IlRoyaltyStructure(BaseModel):
    royalty_rate_and_base: str = "unknown"
    minimum_royalties: str = "unknown"
    reporting_schedule: str = "unknown"
    audit_and_true_up_process: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IlPaymentTerms(BaseModel):
    currency: str = "unknown"
    invoicing_timing: str = "unknown"
    payment_due: str = "unknown"
    late_fees_interest: str = "unknown"
    taxes_withholding: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IlCommercialsAndRoyalties(BaseModel):
    fees_or_royalties_exist: BoolOrUnknown = "unknown"
    royalty_structure: IlRoyaltyStructure = Field(default_factory=IlRoyaltyStructure)
    payment_terms: IlPaymentTerms = Field(default_factory=IlPaymentTerms)


class IlChangeOfControl(BaseModel):
    exists: BoolOrUnknown = "unknown"
    definition: str = "unknown"
    effects: str = "unknown"
    consent_required: BoolOrUnknown = "unknown"
    notice_required: BoolOrUnknown = "unknown"
    termination_right_triggered: BoolOrUnknown = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IlAssignment(BaseModel):
    restricted: BoolOrUnknown = "unknown"
    consent_required: BoolOrUnknown = "unknown"
    by_operation_of_law_included: BoolOrUnknown = "unknown"
    merger_or_change_of_control_treated_as_assignment: BoolOrUnknown = "unknown"
    sale_of_substantially_all_assets_captured: BoolOrUnknown = "unknown"
    permitted_assignments_exceptions: str = "unknown"
    process_and_notice: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IlChangeOfControlAndAssignment(BaseModel):
    change_of_control: IlChangeOfControl = Field(default_factory=IlChangeOfControl)
    assignment: IlAssignment = Field(default_factory=IlAssignment)


class IlTerminationForConvenience(BaseModel):
    exists: BoolOrUnknown = "unknown"
    who_can_terminate: Literal["licensor", "licensee", "both", "unknown"] = "unknown"
    notice_period: str = "unknown"
    fees_or_penalties: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IlTerminationForCause(BaseModel):
    grounds: list[str] = Field(default_factory=list)
    cure_period: str = "unknown"
    notice_requirements: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IlEffectsOfTermination(BaseModel):
    sell_off_or_wind_down_period: str = "unknown"
    continued_use_rights: str = "unknown"
    return_or_destruction_obligations: str = "unknown"
    transition_assistance: str = "unknown"
    survival_terms: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IlTerminationAndEffects(BaseModel):
    termination_for_convenience: IlTerminationForConvenience = Field(
        default_factory=IlTerminationForConvenience
    )
    termination_for_cause: IlTerminationForCause = Field(default_factory=IlTerminationForCause)
    effects_of_termination: IlEffectsOfTermination = Field(
        default_factory=IlEffectsOfTermination
    )


class IlSourceCodeEscrow(BaseModel):
    exists: BoolOrUnknown = "unknown"
    escrow_agent: str = "unknown"
    release_triggers: str = "unknown"
    update_deposit_obligations: str = "unknown"
    access_conditions: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IlInternalInconsistency(BaseModel):
    topic: Literal[
        "license_profile", "scope", "commercials", "change_of_control",
        "assignment", "termination", "escrow", "other", "unknown",
    ] = "unknown"
    description: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class OsComponentObligations(BaseModel):
    disclosure_source_code: str = "unknown"
    attribution_notices: str = "unknown"
    provide_license_text: str = "unknown"
    written_offer: str = "unknown"
    other_obligations: list[str] = Field(default_factory=list)


class OsComponent(BaseModel):
    component_name: str = "unknown"
    version: str = "unknown"
    supplier_or_source: str = "unknown"
    license_names_as_listed: list[str] = Field(default_factory=list)
    license_category_as_stated: Literal["copyleft", "permissive", "proprietary", "unknown"] = (
        "unknown"
    )
    usage_context_product_module: str = "unknown"
    distribution_context_as_stated: Literal[
        "distributed", "saas_hosted", "internal_use", "unknown"
    ] = "unknown"
    modified_as_stated: BoolOrUnknown = "unknown"
    obligations_as_stated: OsComponentObligations = Field(default_factory=OsComponentObligations)
    compliance_status_as_stated: Literal["compliant", "non_compliant", "unknown"] = "unknown"
    notes: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class OsCopyleftComponent(BaseModel):
    component_name: str = "unknown"
    license_names_as_listed: list[str] = Field(default_factory=list)
    stated_implications: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class OsCopyleftSummary(BaseModel):
    copyleft_components_listed: BoolOrUnknown = "unknown"
    copyleft_definition_or_description: str = "unknown"
    copyleft_components: list[OsCopyleftComponent] = Field(default_factory=list)
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class OsDocumentProfile(BaseModel):
    document_type_detected: Literal[
        "oss_inventory", "sbom", "oss_policy", "oss_notices", "other", "unknown"
    ] = "unknown"
    title: str = "unknown"
    effective_date: str = "unknown"
    covered_products_or_repositories: str = "unknown"
    tooling_or_scanning_methods_mentioned: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class OsPolicyAndProcess(BaseModel):
    policy_exists: BoolOrUnknown = "unknown"
    approval_workflow: str = "unknown"
    recordkeeping_requirements: str = "unknown"
    distribution_release_checks: str = "unknown"
    customer_notice_process: str = "unknown"
    engineering_requirements: str = "unknown"
    exceptions_or_waivers_process: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class OsObligationsAndNotices(BaseModel):
    general_attribution_requirements: str = "unknown"
    general_disclosure_requirements: str = "unknown"
    notice_inclusion_requirements: str = "unknown"
    source_code_offer_requirements: str = "unknown"
    trigger_conditions_as_stated: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class OsRiskOrIssue(BaseModel):
    issue_type: Literal[
        "injunction_risk", "source_code_disclosure_risk", "license_incompatibility",
        "missing_attribution", "missing_disclosure", "unknown_license", "other", "unknown",
    ] = "unknown"
    description: str = "unknown"
    remediation_or_action_as_stated: str = "unknown"
    deadline_if_stated: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class OsInternalInconsistency(BaseModel):
    topic: Literal[
        "components", "copyleft", "process", "obligations", "risks", "other", "unknown"
    ] = "unknown"
    description: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)



# ===========================================================================
# Anchor — Intellectual Property (IP)
# ===========================================================================


class IpDisputeOrClaim(BaseModel):
    dispute_type: Literal[
        "infringement_claim", "opposition", "invalidation", "ownership_dispute",
        "trade_secret_misappropriation", "other", "unknown",
    ] = "unknown"
    description: str = "unknown"
    parties: str = "unknown"
    status_as_stated: Literal["threatened", "filed", "pending", "settled", "closed", "unknown"] = "unknown"
    financial_exposure_as_stated: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IpExtraction(BaseModel):
    anchor_id: Literal["intellectual_property"] = "intellectual_property"
    ip_assets: list[IpAsset] = Field(default_factory=list)
    chain_of_title: IpOwnershipMechanics = Field(default_factory=IpOwnershipMechanics)
    license_backs_and_retained_rights: list[IpLicenseBack] = Field(default_factory=list)
    third_party_and_background_ip: IpThirdPartyAndBackground = Field(default_factory=IpThirdPartyAndBackground)
    inbound_licenses: list[IlLicenseProfile] = Field(default_factory=list)
    outbound_licenses: list[IlLicenseProfile] = Field(default_factory=list)
    source_code_escrow: IlSourceCodeEscrow = Field(default_factory=IlSourceCodeEscrow)
    oss_components: list[OsComponent] = Field(default_factory=list)
    oss_copyleft_summary: OsCopyleftSummary = Field(default_factory=OsCopyleftSummary)
    ip_disputes_and_claims: list[IpDisputeOrClaim] = Field(default_factory=list)
    internal_inconsistencies: list[IpInternalInconsistency] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)

# ===========================================================================
# Anchor 10 — Employment & Management
# ===========================================================================


class EmDocumentProfile(BaseModel):
    document_type_detected: Literal[
        "executive_employment_agreement", "change_in_control_retention",
        "bonus_plan", "non_compete_non_solicit", "confidentiality",
        "handbook_policy", "disciplinary_policy", "other", "unknown",
    ] = "unknown"
    employee_or_participant_name: str = "unknown"
    employee_title_or_role: str = "unknown"
    employer_name: str = "unknown"
    effective_date: str = "unknown"
    term_or_duration: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class EmCompensationAndBenefits(BaseModel):
    base_salary: str = "unknown"
    bonus_or_commission: str = "unknown"
    benefits_summary: str = "unknown"
    equity_references: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class EmChangeInControl(BaseModel):
    change_in_control_addressed: BoolOrUnknown = "unknown"
    change_in_control_definition: str = "unknown"
    cash_severance_or_retention_bonus: str = "unknown"
    single_or_double_trigger_as_stated: Literal[
        "single_trigger", "double_trigger", "unclear", "unknown"
    ] = "unknown"
    trigger_window_after_cic: str = "unknown"
    required_conditions: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class EmEquityAcceleration(BaseModel):
    addressed: BoolOrUnknown = "unknown"
    awards_covered: str = "unknown"
    acceleration_terms: str = "unknown"
    percentage_or_amount: str = "unknown"
    treatment_of_performance_awards: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class EmTerminationAndSeverance(BaseModel):
    termination_categories_defined: list[str] = Field(default_factory=list)
    termination_notice_period: str = "unknown"
    severance_summary: str = "unknown"
    continued_benefits: str = "unknown"
    release_or_waiver_required: BoolOrUnknown = "unknown"
    garden_leave: str = "unknown"
    mitigation_or_offset: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class EmNonCompete(BaseModel):
    exists: BoolOrUnknown = "unknown"
    duration: str = "unknown"
    scope: str = "unknown"
    territory: str = "unknown"
    remedies: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class EmNonSolicit(BaseModel):
    exists: BoolOrUnknown = "unknown"
    customers_duration: str = "unknown"
    employees_duration: str = "unknown"
    scope: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class EmNoHire(BaseModel):
    exists: BoolOrUnknown = "unknown"
    details: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class EmConfidentialityCovenant(BaseModel):
    exists: BoolOrUnknown = "unknown"
    duration: str = "unknown"
    scope: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class EmRestrictiveCovenants(BaseModel):
    non_compete: EmNonCompete = Field(default_factory=EmNonCompete)
    non_solicit: EmNonSolicit = Field(default_factory=EmNonSolicit)
    no_hire_or_no_poach: EmNoHire = Field(default_factory=EmNoHire)
    confidentiality: EmConfidentialityCovenant = Field(default_factory=EmConfidentialityCovenant)


class EmKeyPersonDependency(BaseModel):
    key_person_language_present: BoolOrUnknown = "unknown"
    details: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class EmInternalInconsistency(BaseModel):
    topic: Literal[
        "cic_retention", "equity_acceleration", "termination",
        "restrictive_covenants", "compensation", "other", "unknown",
    ] = "unknown"
    description: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class EmploymentManagementExtraction(BaseModel):
    anchor_id: Literal["employment_and_management"] = "employment_and_management"
    executed_status: Literal["executed", "not_executed", "unknown"] = "unknown"
    document_profile: EmDocumentProfile = Field(default_factory=EmDocumentProfile)
    compensation_and_benefits_as_stated: EmCompensationAndBenefits = Field(
        default_factory=EmCompensationAndBenefits
    )
    change_in_control_and_retention: EmChangeInControl = Field(default_factory=EmChangeInControl)
    equity_acceleration: EmEquityAcceleration = Field(default_factory=EmEquityAcceleration)
    termination_and_severance: EmTerminationAndSeverance = Field(
        default_factory=EmTerminationAndSeverance
    )
    restrictive_covenants: EmRestrictiveCovenants = Field(default_factory=EmRestrictiveCovenants)
    key_person_dependency_indicators: EmKeyPersonDependency = Field(
        default_factory=EmKeyPersonDependency
    )
    internal_inconsistencies: list[EmInternalInconsistency] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)


# ===========================================================================
# Anchor 11 — HR Aggregate (replaces EmploymentManagementExtraction for
#              the chapter-level output; lightweight, UI-first schema)
# ===========================================================================


class HrKeyEmployee(BaseModel):
    employee_name: str = "unknown"
    title: str = "unknown"
    signature_status: Literal["executed", "not_executed", "unknown"] = "unknown"
    notice_period: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class HrAggregateExtraction(BaseModel):
    anchor_id: Literal["hr_aggregate"] = "hr_aggregate"
    employee_count_statement: str = "unknown"
    key_risk_summary: str = "unknown"
    legal_exposure_summary: str = "unknown"
    key_employees: list[HrKeyEmployee] = Field(default_factory=list)
    has_independent_contractors: BoolOrUnknown = "unknown"
    contractor_risk_indicators: str = "unknown"
    missing_information: list[str] = Field(default_factory=list)


# ===========================================================================
# Anchor 12 — Regulatory (licenses register + compliance plans)
# ===========================================================================


class RegLicense(BaseModel):
    license_name: str = "unknown"
    issuing_body: str = "unknown"
    license_number: str = "unknown"
    expiry: str = "unknown"
    status: str = "unknown"
    change_of_control_approval_required: BoolOrUnknown = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class RegCompliancePlan(BaseModel):
    plan_name: str = "unknown"
    description: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class RegulatoryExtraction(BaseModel):
    anchor_id: Literal["regulatory"] = "regulatory"
    licenses: list[RegLicense] = Field(default_factory=list)
    compliance_plans: list[RegCompliancePlan] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)


# ===========================================================================
# Anchor 13 — Litigation (cases table + settlements)
# ===========================================================================


class LitCase(BaseModel):
    parties_and_case_id: str = "unknown"
    status: str = "unknown"
    nature_and_relief: str = "unknown"
    estimated_exposure: str = "unknown"
    risk_assessment: str = "unknown"
    additional_notes: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class LitSettlement(BaseModel):
    case_reference: str = "unknown"
    settlement_summary: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class LitigationExtraction(BaseModel):
    anchor_id: Literal["litigation"] = "litigation"
    cases: list[LitCase] = Field(default_factory=list)
    settlements: list[LitSettlement] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)


# ===========================================================================
# Anchor 14 — Taxation (structured entries table)
# ===========================================================================


class TaxEntry(BaseModel):
    entity_or_subject: str = "unknown"
    key_details: str = "unknown"
    status_and_validity: str = "unknown"
    risks_and_implications: str = "unknown"
    gaps_and_follow_ups: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class TaxationExtraction(BaseModel):
    anchor_id: Literal["taxation"] = "taxation"
    entries: list[TaxEntry] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)


# ===========================================================================
# Anchor 15 — Financial Debt (loans table + liens table)
# ===========================================================================


class DebtLoanItem(BaseModel):
    lender: str = "unknown"
    loan_type: str = "unknown"
    principal_and_currency: str = "unknown"
    interest_rate: str = "unknown"
    maturity: str = "unknown"
    coc_consequences: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class DebtLienItem(BaseModel):
    lien_type: str = "unknown"
    collateral: str = "unknown"
    registered_owner: str = "unknown"
    status: str = "unknown"
    related_debt_instrument: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class FinancialDebtExtraction(BaseModel):
    anchor_id: Literal["financial_debt"] = "financial_debt"
    loans_and_credit_lines: list[DebtLoanItem] = Field(default_factory=list)
    liens_and_collateral: list[DebtLienItem] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)


# ===========================================================================
# Anchor 16 — Insurance (policies summary table)
# ===========================================================================


class InsurancePolicy(BaseModel):
    entity_and_policy_type: str = "unknown"
    key_data: str = "unknown"
    status_and_validity: str = "unknown"
    risks_and_implications: str = "unknown"
    gaps_and_follow_ups: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class InsuranceExtraction(BaseModel):
    anchor_id: Literal["insurance"] = "insurance"
    policies: list[InsurancePolicy] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)


# ===========================================================================
# Anchor — ESG / Environmental
# ===========================================================================

class EsgDocumentProfile(BaseModel):
    document_type_detected: Literal[
        "permit", "regulatory_correspondence", "environmental_report",
        "incident_report", "esg_policy", "sustainability_report",
        "esg_commitment", "audit_report", "other", "unknown",
    ] = "unknown"
    authority_or_issuer: str = "unknown"
    jurisdiction: str = "unknown"
    site_or_facility: str = "unknown"
    title_or_subject: str = "unknown"
    document_date: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class EsgPermit(BaseModel):
    permit_name: str = "unknown"
    permit_id_or_number: str = "unknown"
    scope_of_activities: str = "unknown"
    issue_date: str = "unknown"
    expiry_date: str = "unknown"
    conditions_or_limits: str = "unknown"
    monitoring_reporting_obligations: str = "unknown"
    status_as_stated: Literal["valid", "expired", "suspended", "revoked", "pending", "unknown"] = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class EsgAuditFindingIncident(BaseModel):
    event_type: Literal[
        "audit", "inspection", "violation_notice", "spill_release",
        "contamination", "remediation", "other", "unknown",
    ] = "unknown"
    date_or_period: str = "unknown"
    description: str = "unknown"
    affected_area_or_media: str = "unknown"
    corrective_actions_or_remediation: str = "unknown"
    deadlines: str = "unknown"
    status_as_stated: Literal["open", "closed", "ongoing", "unknown"] = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class EsgPenalty(BaseModel):
    penalty_type: Literal["fine", "sanction", "cleanup_cost", "other", "unknown"] = "unknown"
    amount_as_stated: str = "unknown"
    date: str = "unknown"
    basis_or_reason: str = "unknown"
    payment_or_compliance_status_as_stated: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class EsgCommitment(BaseModel):
    commitment_type: Literal[
        "emissions_target", "net_zero", "renewable_energy", "diversity_inclusion",
        "supply_chain", "product_sustainability", "reporting", "certification",
        "other", "unknown",
    ] = "unknown"
    target_or_commitment_text: str = "unknown"
    timeline_or_deadline: str = "unknown"
    measurement_or_reporting_requirements: str = "unknown"
    audit_or_verification_requirements: str = "unknown"
    consequences_for_noncompliance_as_stated: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class EsgInternalInconsistency(BaseModel):
    topic: Literal["permits", "incidents", "penalties", "commitments", "dates", "other", "unknown"] = "unknown"
    description: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class EsgEnvironmentalExtraction(BaseModel):
    anchor_id: Literal["esg_environmental"] = "esg_environmental"
    executed_status: Literal["executed", "not_executed", "unknown"] = "unknown"
    document_profile: EsgDocumentProfile = Field(default_factory=EsgDocumentProfile)
    environmental_permits_and_requirements_as_stated: list[EsgPermit] = Field(default_factory=list)
    audits_findings_incidents_and_remediation_as_stated: list[EsgAuditFindingIncident] = Field(default_factory=list)
    penalties_and_liabilities_as_stated: list[EsgPenalty] = Field(default_factory=list)
    material_esg_commitments_as_stated: list[EsgCommitment] = Field(default_factory=list)
    internal_inconsistencies: list[EsgInternalInconsistency] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)


# ===========================================================================
# Anchor — Physical Assets
# ===========================================================================

class ReRenewalOption(BaseModel):
    renewal_term: str = "unknown"
    renewal_notice_window: str = "unknown"
    renewal_rent_terms: str = "unknown"
    conditions: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class RePropertyAndLeaseProfile(BaseModel):
    document_type_detected: Literal[
        "lease", "sublease", "amendment", "consent", "guaranty",
        "estoppel", "property_schedule", "other", "unknown",
    ] = "unknown"
    property_address: str = "unknown"
    premises_description: str = "unknown"
    agreement_title: str = "unknown"
    landlord_name: str = "unknown"
    tenant_name: str = "unknown"
    sublandlord_subtenant_or_guarantor: str = "unknown"
    base_rent: str = "unknown"
    additional_rent_or_pass_throughs: str = "unknown"
    security_deposit_or_loc: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class ReTermAndRenewal(BaseModel):
    commencement_date: str = "unknown"
    rent_commencement_date: str = "unknown"
    expiration_date: str = "unknown"
    initial_term: str = "unknown"
    renewal_options: list[ReRenewalOption] = Field(default_factory=list)
    auto_renew: BoolOrUnknown = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class ReConsentGranted(BaseModel):
    exists: BoolOrUnknown = "unknown"
    granted_for: str = "unknown"
    conditions: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class ReAssignmentSubletConsents(BaseModel):
    assignment_restricted: BoolOrUnknown = "unknown"
    subletting_restricted: BoolOrUnknown = "unknown"
    landlord_consent_required: BoolOrUnknown = "unknown"
    consent_conditions: str = "unknown"
    consent_fees_or_profit_sharing: str = "unknown"
    reasonableness_standard: str = "unknown"
    change_of_control_treated_as_assignment: BoolOrUnknown = "unknown"
    change_of_control_clause_summary: str = "unknown"
    consent_granted_in_this_document: ReConsentGranted = Field(default_factory=ReConsentGranted)
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class ReEarlyTerminationRight(BaseModel):
    who_can_terminate: Literal["tenant", "landlord", "both", "unknown"] = "unknown"
    trigger: str = "unknown"
    notice_period: str = "unknown"
    termination_fee_or_conditions: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class ReDefaultAndCure(BaseModel):
    defaults_listed_summary: str = "unknown"
    cure_periods: str = "unknown"
    remedies_summary: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class ReEarlyTerminationAndDefault(BaseModel):
    early_termination_rights: list[ReEarlyTerminationRight] = Field(default_factory=list)
    default_and_cure: ReDefaultAndCure = Field(default_factory=ReDefaultAndCure)


class ReRestorationAlterationsReturn(BaseModel):
    alterations_approval_required: BoolOrUnknown = "unknown"
    restoration_obligations: str = "unknown"
    removal_of_improvements: str = "unknown"
    reinstatement_requirements: str = "unknown"
    surrender_conditions: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class ReOtherKeyTerms(BaseModel):
    use_restrictions: str = "unknown"
    relocation_rights: str = "unknown"
    expansion_or_rofo_rofr_space: str = "unknown"
    insurance_requirements: str = "unknown"
    indemnity_terms: str = "unknown"
    environmental_or_hazardous_materials: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class ReInternalInconsistency(BaseModel):
    topic: Literal[
        "property_profile", "term", "rent", "assignment_consent",
        "termination_default", "restoration", "other", "unknown",
    ] = "unknown"
    description: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class PhysicalAssetsExtraction(BaseModel):
    anchor_id: Literal["physical_assets"] = "physical_assets"
    executed_status: Literal["executed", "not_executed", "unknown"] = "unknown"
    property_and_lease_profile: RePropertyAndLeaseProfile = Field(default_factory=RePropertyAndLeaseProfile)
    term_and_renewal: ReTermAndRenewal = Field(default_factory=ReTermAndRenewal)
    assignment_subletting_and_consents: ReAssignmentSubletConsents = Field(default_factory=ReAssignmentSubletConsents)
    early_termination_and_default: ReEarlyTerminationAndDefault = Field(default_factory=ReEarlyTerminationAndDefault)
    restoration_alterations_and_return: ReRestorationAlterationsReturn = Field(default_factory=ReRestorationAlterationsReturn)
    other_key_terms_as_stated: ReOtherKeyTerms = Field(default_factory=ReOtherKeyTerms)
    internal_inconsistencies: list[ReInternalInconsistency] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)


# ===========================================================================
# Anchor — Privacy & Cyber
# ===========================================================================

class PcDocumentProfile(BaseModel):
    document_type_detected: Literal[
        "privacy_policy", "dpa", "dpia", "ropa", "incident_report",
        "pen_test_report", "soc2_report", "iso_certificate_report",
        "regulatory_correspondence", "security_addendum", "other", "unknown",
    ] = "unknown"
    title_or_subject: str = "unknown"
    effective_or_report_date: str = "unknown"
    scope_systems_products: str = "unknown"
    jurisdictions_referenced: list[str] = Field(default_factory=list)
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class PcComplianceStatement(BaseModel):
    framework_or_law: Literal[
        "gdpr", "ccpa", "israeli_privacy_law", "hipaa", "pci_dss", "other", "unknown"
    ] = "unknown"
    statement_type: Literal[
        "compliant", "non_compliant", "gap_identified", "certified", "assessment_only", "unknown"
    ] = "unknown"
    details: str = "unknown"
    remediation_plan_or_deadline: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class PcDataProcessingSummary(BaseModel):
    roles_controller_processor: str = "unknown"
    categories_of_data_subjects: str = "unknown"
    categories_of_personal_data: str = "unknown"
    processing_purposes: str = "unknown"
    retention_and_deletion: str = "unknown"
    international_transfers: str = "unknown"
    subprocessing_rules: str = "unknown"
    lawful_basis_or_consents_as_stated: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class PcSecurityCommitments(BaseModel):
    security_measures_summary: str = "unknown"
    standards_certifications: str = "unknown"
    encryption_and_access_controls: str = "unknown"
    logging_and_monitoring: str = "unknown"
    vulnerability_management: str = "unknown"
    pen_test_or_security_testing_obligations: str = "unknown"
    security_audit_rights_by_customers: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class PcIncidentOrBreach(BaseModel):
    incident_date_or_period: str = "unknown"
    nature_of_incident: str = "unknown"
    systems_or_data_impacted: str = "unknown"
    number_of_records_or_impacted_subjects: str = "unknown"
    notifications_made: str = "unknown"
    notification_timing_requirements: str = "unknown"
    regulator_involvement: str = "unknown"
    customer_impact: str = "unknown"
    remediation_steps: str = "unknown"
    fines_penalties_or_claims_as_stated: str = "unknown"
    status_as_stated: Literal["open", "closed", "ongoing", "unknown"] = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class PcAssessmentReport(BaseModel):
    report_type: Literal["pen_test", "soc2", "iso", "risk_assessment", "other", "unknown"] = "unknown"
    report_date: str = "unknown"
    scope: str = "unknown"
    findings_summary: str = "unknown"
    critical_findings_as_stated: str = "unknown"
    remediation_status_as_stated: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class PcUnusualObligation(BaseModel):
    obligation_type: Literal[
        "breach_notice_short_window", "broad_audit_rights", "special_indemnity",
        "unlimited_liability", "data_localization", "other", "unknown",
    ] = "unknown"
    details: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class PcRegulatoryAction(BaseModel):
    authority: str = "unknown"
    action_type: Literal["investigation", "audit", "fine", "warning", "order", "other", "unknown"] = "unknown"
    date: str = "unknown"
    details: str = "unknown"
    penalty_amount_as_stated: str = "unknown"
    status_as_stated: Literal["open", "closed", "ongoing", "unknown"] = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class PcInternalInconsistency(BaseModel):
    topic: Literal[
        "compliance", "data_processing", "security", "incident", "reports", "other", "unknown"
    ] = "unknown"
    description: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class PrivacyAndCyberExtraction(BaseModel):
    anchor_id: Literal["privacy_and_cyber"] = "privacy_and_cyber"
    executed_status: Literal["executed", "not_executed", "unknown"] = "unknown"
    document_profile: PcDocumentProfile = Field(default_factory=PcDocumentProfile)
    compliance_statements_as_stated: list[PcComplianceStatement] = Field(default_factory=list)
    data_processing_summary_as_stated: PcDataProcessingSummary = Field(default_factory=PcDataProcessingSummary)
    security_commitments_as_stated: PcSecurityCommitments = Field(default_factory=PcSecurityCommitments)
    incidents_and_breaches_as_stated: list[PcIncidentOrBreach] = Field(default_factory=list)
    assessments_and_reports_as_stated: list[PcAssessmentReport] = Field(default_factory=list)
    unusual_contractual_obligations_as_stated: list[PcUnusualObligation] = Field(default_factory=list)
    regulatory_actions_and_penalties_as_stated: list[PcRegulatoryAction] = Field(default_factory=list)
    internal_inconsistencies: list[PcInternalInconsistency] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)


# ===========================================================================
# Anchor — Intangible Assets
# ===========================================================================


class IaAssetItem(BaseModel):
    asset_type: Literal[
        "goodwill", "trade_secret", "know_how", "customer_list",
        "brand_value", "other", "unknown",
    ] = "unknown"
    description: str = "unknown"
    protection_measures: str = "unknown"
    confidentiality_obligations: str = "unknown"
    return_or_destruction_obligations: str = "unknown"
    access_restrictions: str = "unknown"
    evidence: list[EvidentiaryReference] = Field(default_factory=list)


class IntangibleAssetsExtraction(BaseModel):
    anchor_id: Literal["intangible_assets"] = "intangible_assets"
    assets: list[IaAssetItem] = Field(default_factory=list)
    gaps_and_unknowns: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    "BoolOrUnknown",
    "NumOrUnknown",
    "CorporateOwnershipExtraction",
    "TransactionDocumentsExtraction",
    "CustomerRevenueContractsExtraction",
    "SupplierCriticalVendorExtraction",
    "EmploymentManagementExtraction",
    "HrAggregateExtraction",
    "HrKeyEmployee",
    "RegulatoryExtraction",
    "RegLicense",
    "RegCompliancePlan",
    "LitigationExtraction",
    "LitCase",
    "LitSettlement",
    "TaxationExtraction",
    "TaxEntry",
    "FinancialDebtExtraction",
    "DebtLoanItem",
    "DebtLienItem",
    "InsuranceExtraction",
    "InsurancePolicy",
    "IpExtraction",
    "IpAsset",
    "IpDisputeOrClaim",
    "IlLicenseProfile",
    "OsComponent",
    "PhysicalAssetsExtraction",
    "RePropertyAndLeaseProfile",
    "ReTermAndRenewal",
    "ReAssignmentSubletConsents",
    "PrivacyAndCyberExtraction",
    "PcComplianceStatement",
    "PcDataProcessingSummary",
    "PcSecurityCommitments",
    "PcIncidentOrBreach",
    "IntangibleAssetsExtraction",
    "IaAssetItem",
    "EsgEnvironmentalExtraction",
    "EsgPermit",
    "EsgAuditFindingIncident",
    "EsgPenalty",
    "EsgCommitment",
    "PcAssessmentReport",
    "PcRegulatoryAction",
]
