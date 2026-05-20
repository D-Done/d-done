// ============================================================
// Domain types matching the backend JSON schema
// ============================================================

export type RiskLevel = "high" | "medium" | "low";

export type FindingCategory =
  | "lien"
  | "ownership"
  | "zoning"
  | "corporate"
  | "identity"
  | "financial"
  | "legal"
  | "addendum"
  | "regulatory"
  | "other";

export type FindingSeverity = "critical" | "warning" | "info";

export type DocumentType =
  | "tabu"
  | "tama"
  | "zero_report"
  | "corporate_protocol"
  | "company_extract"
  | "project_agreement"
  | "credit_committee"
  | "signing_protocol"
  | "planning_permit"
  | "id"
  | "lien"
  | "other";

export type TransactionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "partial"
  | "needs_review";

export type ProjectStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "partial"
  | "needs_review";

export type UploadStatus = "pending" | "uploading" | "uploaded" | "failed";

// ============================================================
// Source citation — the key to "clickable findings"
// ============================================================

export interface BoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SourceRef {
  source_document_name: string;
  page_number: number;
  verbatim_quote: string;
  bounding_boxes?: BoundingBox[];
}

// ============================================================
// DD Output schema (returned by Gemini, stored in DB)
// ============================================================

export interface ExecutiveSummary {
  risk_level: RiskLevel;
  summary: string;
}

export interface TimelineEvent {
  date: string; // YYYY-MM-DD
  event_description: string;
  source: SourceRef;
}

export interface Finding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  sources: SourceRef[];
  cross_references: string[];
}

export interface DocumentAnalyzed {
  name: string;
  type: DocumentType;
  page_count: number;
  handwritten_notes_detected: boolean;
  illegible_sections: { page: number; description: string }[];
}

export interface DDReport {
  executive_summary: ExecutiveSummary;
  timeline: TimelineEvent[];
  findings: Finding[];
  documents_analyzed: DocumentAnalyzed[];
}

// ============================================================
// Real Estate Finance DD Output schema
// ============================================================

/** Project metadata — filled server-side; agent always returns null values. */
export interface ProjectHeader {
  project_name?: string | null;
  client_name?: string | null;
  status?: string | null;
  created_at?: string | null;
  doc_count?: number | null;
}

/** Zero-report financials surfaced in the DD report. */
export interface ZeroReportMetrics {
  addressee?: string | null;
  /** Profit on Turnover — רווח למחזור = (Revenue − Cost) / Revenue */
  profit_on_turnover?: number | null;
  /** Profit on Cost — רווח לעלות = (Revenue − Cost) / Cost */
  profit_on_cost?: number | null;
  construction_restrictions: string[];
  /** 'אין התייחסות למדד בדו"ח האפס' when absent */
  indexation_details?: string | null;
  /** (policies + guarantees + equity_completion) × 1.5 — from credit committee only */
  total_mortgage_registration?: number | null;
}

/** Lender-facing cross-document compliance checks. */
export interface RealEstateCompoundState {
  building_count?: number | null;
  apartment_count?: number | null;
}

export interface RealEstateCompoundDetails {
  address?: string | null;
  gush?: string | null;
  helka?: string | null;
  incoming_state?: RealEstateCompoundState | null;
  outgoing_state?: RealEstateCompoundState | null;
  discrepancy_note?: string | null;
}

export interface RealEstateTenantRow {
  helka?: string | null;
  sub_parcel?: string | null;
  owner_name?: string | null;
  is_signed?: boolean | null;
  date_signed?: string | null;
  /** הערת אזהרה לטובת היזם */
  is_warning_note_registered?: boolean | null;
  restrictive_note_registered?: boolean | null;
  /** Whether a mortgage is registered on this parcel */
  is_mortgage_registered?: boolean | null;
  /** Name-match gaps, מסמך מגשר findings, third-party notes, etc. */
  notes?: string | null;
}

export interface UpgradeDowngradeInfo {
  upgrade_allowed?: boolean | null;
  upgrade_details?: string | null;
  downgrade_allowed?: boolean | null;
  downgrade_details?: string | null;
}

export interface ContractualMilestone {
  milestone: string;
  deadline_or_condition: string;
  source?: SourceRef | null;
}

export interface RealEstateDeveloperSignature {
  developer_signed_date?: string | null;
  authorized_signatory_name?: string | null;
  authorized_signatory_id?: string | null;
  /** true = protocol confirms authority; false = mismatch; null = not provided */
  signing_protocol_authorized?: boolean | null;
}

export interface RealEstatePowerOfAttorney {
  developer_attorney?: string | null;
  owners_attorney?: string | null;
}

export interface RealEstateFinancingBody {
  lender_definition_clause?: string | null;
  actual_lender?: string | null;
  lender_compliance_note?: string | null;
  mezzanine_loan_exists?: boolean | null;
  mezzanine_loan_details?: string | null;
}

// UBO ownership graph for visualization
export interface UboNode {
  id: string;
  name: string;
  type: "company" | "person";
  company_number?: string | null;
  id_number?: string | null;
}

export interface UboEdge {
  from_id: string;
  to_id: string;
  share_pct?: string | null;
}

export interface UboGraph {
  nodes: UboNode[];
  edges: UboEdge[];
}

export interface RealEstateFinanceDDReport {
  // Tier A — project metadata (server-populated)
  project_header?: ProjectHeader | null;

  // Tier B — deal narrative
  executive_summary: ExecutiveSummary;
  timeline: TimelineEvent[];
  compound_details?: RealEstateCompoundDetails | null;
  tenant_table: RealEstateTenantRow[];
  /** אסמכתאות לאחוז חתימות על ההסכם (מקור: הסכם פרויקט) */
  tenant_table_signing_sources?: SourceRef[];
  /** אסמכתאות לאחוז הערות אזהרה ליזם (מקור: נסח טאבו) */
  tenant_table_warning_note_sources?: SourceRef[];
  developer_signature?: RealEstateDeveloperSignature | null;
  power_of_attorney?: RealEstatePowerOfAttorney | null;
  financing?: RealEstateFinancingBody | null;
  contractual_milestones?: ContractualMilestone[];
  upgrade_downgrade?: UpgradeDowngradeInfo | null;

  // Tier C — lender analytics
  zero_report_metrics?: ZeroReportMetrics | null;
  signing_percentage: number;
  developer_ubo_chain: string[];
  /** Structured UBO graph (nodes + edges) for ownership visualization */
  developer_ubo_graph?: UboGraph | null;
  high_risk_flags: string[];
  findings: Finding[];
}

// ============================================================
// DD Check / Results from the backend API
// ============================================================

export interface DDCheckSummary {
  id: string;
  project_id: string;
  status: string;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}

// ============================================================
// QA Judge types
// ============================================================

export interface QACriterionScore {
  criterion_id: string;
  criterion_name: string;
  passed: boolean;
  confidence: number;
  reasoning: string;
}

export interface QASummary {
  is_approved: boolean;
  scores: QACriterionScore[];
  corrections_he: string[];
}

// ============================================================
// M&A DD Report (v1 — 10 mandatory chapters)
// ============================================================

export type MaChapterId =
  | "transaction_overview"
  | "corporate_governance"
  | "customer_obligations"
  | "supplier_obligations"
  | "hr"
  | "regulatory"
  | "litigation"
  | "taxation"
  | "financial_debt"
  | "insurance"
  | "intellectual_property"
  | "physical_assets"
  | "privacy_and_cyber"
  | "esg_environmental"
  | "intangible_assets";

// ---------------------------------------------------------------------------
// Anchor extraction types (simplified TypeScript mirrors of Python schemas)
// ---------------------------------------------------------------------------

export interface MaEvidenceRef {
  source_document_name: string;
  page_number: number;
  verbatim_quote?: string | null;
  bounding_boxes?: { x0: number; y0: number; x1: number; y1: number }[];
}

// Corporate governance
export interface MaCapTableHolder {
  holder_name: string;
  holder_type: "individual" | "entity" | "unknown";
  share_class_or_security: string;
  shares_or_units: number | "unknown";
  ownership_percentage: number | "unknown";
  voting_percentage: number | "unknown";
  notes: string;
  evidence: MaEvidenceRef[];
}

export interface MaShareClass {
  share_class: string;
  rights_summary: string;
  par_value: string;
  issued_or_outstanding: string;
}

export interface MaAuthorizedSignatory {
  signatory_name: string;
  title_or_role: string;
  signing_rule: string;
  limitations_or_conditions: string;
  evidence: MaEvidenceRef[];
}

export interface MaTransferRestriction {
  restriction_type: string;
  applies_to: string;
  who_must_approve_or_benefits: string;
  trigger_events: string;
  process_summary: string;
  evidence: MaEvidenceRef[];
}

export interface MaCorporateOwnershipAnchor {
  anchor_id: "corporate_ownership";
  executed_status: "executed" | "not_executed" | "unknown";
  company_identity: {
    legal_name: string;
    registration_number: string;
    jurisdiction: string;
    entity_type: string;
    registered_address: string;
  };
  share_capital: {
    authorized_share_capital: string;
    issued_share_capital: string;
    share_classes: MaShareClass[];
  };
  cap_table: {
    exists_in_document: boolean | "unknown";
    holders: MaCapTableHolder[];
  };
  authorized_signatories: MaAuthorizedSignatory[];
  transfer_restrictions_and_shareholder_rights: {
    restrictions: MaTransferRestriction[];
  };
  missing_information: string[];
}

// Customer obligations
export interface MaCustomerAnchor {
  anchor_id: "customer_revenue_contracts";
  executed_status: "executed" | "not_executed" | "unknown";
  contract_profile: {
    agreement_title: string;
    parties: { name: string; role: string }[];
    effective_date: string;
    term_start_date: string;
    term_end_date: string;
  };
  commercials: {
    fees_and_pricing: {
      pricing_model: string;
      fee_amounts_or_rate_card: string;
      currency: string;
      invoicing_and_payment_terms: string;
      minimum_commitments: string;
    };
    mfn_and_benchmarking: { mfn_exists: boolean | "unknown"; remedy_if_triggered: string };
  };
  term_and_renewal: {
    initial_term: string;
    auto_renew: boolean | "unknown";
    renewal_term: string;
    non_renewal_notice_window: string;
  };
  termination_and_suspension: {
    termination_for_convenience: {
      by_customer: boolean | "unknown";
      notice_period: string;
      early_termination_fees_or_charges: string;
    };
    termination_for_cause: { grounds: string[]; cure_period: string };
    suspension_rights: { exists: boolean | "unknown"; triggers: string };
  };
  change_of_control_and_assignment: {
    change_of_control: {
      exists: boolean | "unknown";
      effects: string;
      consent_required: boolean | "unknown";
      termination_right_triggered: boolean | "unknown";
    };
    assignment: {
      restricted: boolean | "unknown";
      consent_required: boolean | "unknown";
    };
  };
  sla_and_credits: { sla_exists: boolean | "unknown"; sla_summary: string };
  missing_information: string[];
}

// Supplier obligations
export interface MaSupplierAnchor {
  anchor_id: "supplier_critical_vendor_contracts";
  executed_status: "executed" | "not_executed" | "unknown";
  contract_profile: {
    agreement_title: string;
    parties: { name: string; role: string }[];
    services_or_goods: string;
    criticality_indicators: string;
    effective_date: string;
    term_start_date: string;
    term_end_date: string;
  };
  commercial_terms: {
    fees_and_pricing: {
      fee_amounts_or_rate_card: string;
      currency: string;
      invoicing_and_payment_terms: string;
      late_fees_interest: string;
    };
    price_changes_and_repricing: { notice_period: string };
    minimum_commitments: {
      commitment_type: string;
      amount_or_volume: string;
      penalties_or_consequences: string;
    }[];
  };
  term_and_renewal: {
    initial_term: string;
    auto_renew: boolean | "unknown";
    non_renewal_notice_window: string;
  };
  termination_and_continuity: {
    termination_for_convenience: {
      exists: boolean | "unknown";
      notice_period: string;
    };
    termination_for_cause: { grounds: string[]; cure_period: string };
    exit_and_transition: { business_continuity_dr: string; transition_assistance: string };
  };
  change_of_control_and_assignment: {
    change_of_control: {
      exists: boolean | "unknown";
      effects: string;
      consent_required: boolean | "unknown";
      termination_right_triggered: boolean | "unknown";
    };
    assignment: { consent_required: boolean | "unknown" };
  };
  missing_information: string[];
}

// HR Aggregate
export interface MaHrKeyEmployee {
  employee_name: string;
  title: string;
  signature_status: "executed" | "not_executed" | "unknown";
  notice_period: string;
}

export interface MaHrAggregateAnchor {
  anchor_id: "hr_aggregate";
  employee_count_statement: string;
  key_risk_summary: string;
  legal_exposure_summary: string;
  key_employees: MaHrKeyEmployee[];
  has_independent_contractors: boolean | "unknown";
  contractor_risk_indicators: string;
  missing_information: string[];
}

// Regulatory
export interface MaRegLicense {
  license_name: string;
  issuing_body: string;
  license_number: string;
  expiry: string;
  status: string;
  change_of_control_approval_required: boolean | "unknown";
  evidence: MaEvidenceRef[];
}

export interface MaRegulatoryAnchor {
  anchor_id: "regulatory";
  licenses: MaRegLicense[];
  compliance_plans: { plan_name: string; description: string }[];
  missing_information: string[];
}

// Litigation
export interface MaLitCase {
  parties_and_case_id: string;
  status: string;
  nature_and_relief: string;
  estimated_exposure: string;
  risk_assessment: string;
  additional_notes: string;
  evidence: MaEvidenceRef[];
}

export interface MaLitigationAnchor {
  anchor_id: "litigation";
  cases: MaLitCase[];
  settlements: { case_reference: string; settlement_summary: string }[];
  missing_information: string[];
}

// Taxation
export interface MaTaxEntry {
  entity_or_subject: string;
  key_details: string;
  status_and_validity: string;
  risks_and_implications: string;
  gaps_and_follow_ups: string;
  evidence: MaEvidenceRef[];
}

export interface MaTaxationAnchor {
  anchor_id: "taxation";
  entries: MaTaxEntry[];
  missing_information: string[];
}

// Financial Debt
export interface MaDebtLoanItem {
  lender: string;
  loan_type: string;
  principal_and_currency: string;
  interest_rate: string;
  maturity: string;
  coc_consequences: string;
  evidence: MaEvidenceRef[];
}

export interface MaDebtLienItem {
  lien_type: string;
  collateral: string;
  registered_owner: string;
  status: string;
  related_debt_instrument: string;
  evidence: MaEvidenceRef[];
}

export interface MaFinancialDebtAnchor {
  anchor_id: "financial_debt";
  loans_and_credit_lines: MaDebtLoanItem[];
  liens_and_collateral: MaDebtLienItem[];
  missing_information: string[];
}

// Insurance
export interface MaInsurancePolicy {
  entity_and_policy_type: string;
  key_data: string;
  status_and_validity: string;
  risks_and_implications: string;
  gaps_and_follow_ups: string;
  evidence: MaEvidenceRef[];
}

export interface MaInsuranceAnchor {
  anchor_id: "insurance";
  policies: MaInsurancePolicy[];
  missing_information: string[];
}

// ESG / Environmental
export interface MaEsgPermit {
  permit_name: string;
  permit_id_or_number: string;
  scope_of_activities: string;
  expiry_date: string;
  conditions_or_limits: string;
  status_as_stated: string;
}

export interface MaEsgIncident {
  event_type: string;
  date_or_period: string;
  description: string;
  affected_area_or_media: string;
  corrective_actions_or_remediation: string;
  status_as_stated: string;
}

export interface MaEsgPenalty {
  penalty_type: string;
  amount_as_stated: string;
  basis_or_reason: string;
  payment_or_compliance_status_as_stated: string;
}

export interface MaEsgCommitment {
  commitment_type: string;
  target_or_commitment_text: string;
  timeline_or_deadline: string;
  measurement_or_reporting_requirements: string;
  consequences_for_noncompliance_as_stated: string;
}

export interface MaEsgAnchor {
  anchor_id: "esg_environmental";
  executed_status: "executed" | "not_executed" | "unknown";
  document_profile: {
    document_type_detected: string;
    authority_or_issuer: string;
    jurisdiction: string;
    site_or_facility: string;
    title_or_subject: string;
    document_date: string;
  };
  environmental_permits_and_requirements_as_stated: MaEsgPermit[];
  audits_findings_incidents_and_remediation_as_stated: MaEsgIncident[];
  penalties_and_liabilities_as_stated: MaEsgPenalty[];
  material_esg_commitments_as_stated: MaEsgCommitment[];
  missing_information: string[];
}

// Physical Assets
export interface MaPhysicalAssetsRenewalOption {
  renewal_term: string;
  renewal_notice_window: string;
  renewal_rent_terms: string;
  conditions: string;
}

export interface MaPhysicalAssetsAnchor {
  anchor_id: "physical_assets";
  executed_status: "executed" | "not_executed" | "unknown";
  property_and_lease_profile: {
    document_type_detected: string;
    property_address: string;
    premises_description: string;
    agreement_title: string;
    landlord_name: string;
    tenant_name: string;
    base_rent: string;
    additional_rent_or_pass_throughs: string;
    security_deposit_or_loc: string;
  };
  term_and_renewal: {
    commencement_date: string;
    expiration_date: string;
    initial_term: string;
    renewal_options: MaPhysicalAssetsRenewalOption[];
    auto_renew: boolean | "unknown";
  };
  assignment_subletting_and_consents: {
    assignment_restricted: boolean | "unknown";
    subletting_restricted: boolean | "unknown";
    landlord_consent_required: boolean | "unknown";
    change_of_control_treated_as_assignment: boolean | "unknown";
    change_of_control_clause_summary: string;
  };
  early_termination_and_default: {
    early_termination_rights: { who_can_terminate: string; trigger: string; notice_period: string; termination_fee_or_conditions: string }[];
    default_and_cure: { defaults_listed_summary: string; cure_periods: string; remedies_summary: string };
  };
  restoration_alterations_and_return: {
    restoration_obligations: string;
    removal_of_improvements: string;
    surrender_conditions: string;
  };
  other_key_terms_as_stated: {
    use_restrictions: string;
    relocation_rights: string;
    insurance_requirements: string;
    environmental_or_hazardous_materials: string;
  };
  missing_information: string[];
}

// Intellectual Property (IP)
export interface MaIpAsset {
  ip_type: string;
  asset_name_or_title: string;
  identifier_numbers: string;
  jurisdiction: string;
  filing_or_registration_date: string;
  scope_description: string;
}

export interface MaIpLicenseProfile {
  license_direction: "inbound" | "outbound" | "mixed" | "unknown";
  document_type_detected: string;
  agreement_title: string;
  effective_date: string;
  licensed_subject_matter: string;
  auto_renew: boolean | "unknown";
}

export interface MaIpOssComponent {
  component_name: string;
  license_names_as_listed: string[];
  license_category_as_stated: "copyleft" | "permissive" | "proprietary" | "unknown";
  compliance_status_as_stated: string;
}

export interface MaIpDisputeOrClaim {
  dispute_type: string;
  description: string;
  parties: string;
  status_as_stated: string;
  financial_exposure_as_stated: string;
}

export interface MaIpAnchor {
  anchor_id: "intellectual_property";
  ip_assets: MaIpAsset[];
  chain_of_title: {
    assignment_language_type: string;
    assignment_scope: string;
    works_made_for_hire_language: boolean | "unknown";
    further_assurances_obligation: boolean | "unknown";
  };
  license_backs_and_retained_rights: { exists: boolean | "unknown"; retained_rights_holder: string; license_scope: string }[];
  inbound_licenses: MaIpLicenseProfile[];
  outbound_licenses: MaIpLicenseProfile[];
  oss_components: MaIpOssComponent[];
  ip_disputes_and_claims: MaIpDisputeOrClaim[];
  missing_information: string[];
}

// Intangible Assets
export interface MaIntangibleAssetItem {
  asset_type: string;
  description: string;
  protection_measures: string;
  confidentiality_obligations: string;
  return_or_destruction_obligations: string;
  access_restrictions: string;
}

export interface MaIntangibleAssetsAnchor {
  anchor_id: "intangible_assets";
  assets: MaIntangibleAssetItem[];
  gaps_and_unknowns: string[];
  missing_information: string[];
}

// Privacy & Cyber
export interface MaPrivacyComplianceStatement {
  framework_or_law: string;
  statement_type: string;
  details: string;
  remediation_plan_or_deadline: string;
}

export interface MaPrivacyIncident {
  incident_date_or_period: string;
  nature_of_incident: string;
  systems_or_data_impacted: string;
  notifications_made: string;
  fines_penalties_or_claims_as_stated: string;
  status_as_stated: string;
}

export interface MaPrivacyAssessmentReport {
  report_type: string;
  report_date: string;
  scope: string;
  findings_summary: string;
  critical_findings_as_stated: string;
  remediation_status_as_stated: string;
}

export interface MaPrivacyCyberAnchor {
  anchor_id: "privacy_and_cyber";
  executed_status: "executed" | "not_executed" | "unknown";
  document_profile: {
    document_type_detected: string;
    title_or_subject: string;
    effective_or_report_date: string;
    scope_systems_products: string;
    jurisdictions_referenced: string[];
  };
  compliance_statements_as_stated: MaPrivacyComplianceStatement[];
  data_processing_summary_as_stated: {
    roles_controller_processor: string;
    categories_of_personal_data: string;
    processing_purposes: string;
    international_transfers: string;
    retention_and_deletion: string;
  };
  security_commitments_as_stated: {
    security_measures_summary: string;
    standards_certifications: string;
    encryption_and_access_controls: string;
    vulnerability_management: string;
    pen_test_or_security_testing_obligations: string;
  };
  incidents_and_breaches_as_stated: MaPrivacyIncident[];
  assessments_and_reports_as_stated: MaPrivacyAssessmentReport[];
  regulatory_actions_and_penalties_as_stated: { authority: string; action_type: string; details: string; penalty_amount_as_stated: string; status_as_stated: string }[];
  missing_information: string[];
}

export type MaAnchorExtraction =
  | MaCorporateOwnershipAnchor
  | MaCustomerAnchor
  | MaSupplierAnchor
  | MaHrAggregateAnchor
  | MaRegulatoryAnchor
  | MaLitigationAnchor
  | MaTaxationAnchor
  | MaFinancialDebtAnchor
  | MaInsuranceAnchor
  | MaIpAnchor
  | MaPhysicalAssetsAnchor
  | MaPrivacyCyberAnchor
  | MaEsgAnchor
  | MaIntangibleAssetsAnchor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | Record<string, any>;

export interface MaFinding {
  id: string;
  subsection: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  sources: SourceRef[];
}

export interface MaFollowUp {
  id: string;
  description: string;
  severity: FindingSeverity;
  suggested_document?: string | null;
  related_sources?: SourceRef[];
}

export interface MaChapterOutput {
  chapter_id: MaChapterId;
  chapter_title_he: string;
  summary_he: string;
  empty_state: boolean;
  findings: MaFinding[];
  follow_ups: MaFollowUp[];
  timeline_events: TimelineEvent[];
}

export interface MaCompletenessItem {
  id: string;
  chapter_ids: string[];
  description: string;
  severity: FindingSeverity;
  suggested_document?: string | null;
}

export interface MaCompletenessChecklist {
  items: MaCompletenessItem[];
  summary_he?: string | null;
}

export interface MaProjectHeader {
  project_name?: string | null;
  client_name?: string | null;
  representing_role?: string | null;
  counterparty_name?: string | null;
  status?: string | null;
  created_at?: string | null;
  doc_count?: number | null;
}

export interface MaDDReport {
  transaction_type: "ma";
  project_header?: MaProjectHeader | null;
  executive_summary?: ExecutiveSummary | null;
  chapters: MaChapterOutput[];
  completeness?: MaCompletenessChecklist | null;
  agent_session_id?: string;
  anchor_extractions?: Record<string, MaAnchorExtraction>;
}

export interface DDReportResponse {
  check_id: string;
  project_id: string;
  status: string;
  report: (DDReport | RealEstateFinanceDDReport | MaDDReport) | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface AnalyzeResponse {
  check_id: string;
  status: string;
  report: (DDReport | RealEstateFinanceDDReport | MaDDReport) | null;
  qa_summary?: QASummary | null;
  qa_attempts?: number;
  error_message?: string | null;
}

// ============================================================
// API entities — Projects & Files
// ============================================================

export interface ProjectFile {
  id: string;
  project_id: string;
  original_name: string;
  gcs_uri: string;
  doc_type: string;
  /** Logical folder name the file was placed in (optional). */
  folder?: string | null;
  file_size_bytes: number | null;
  upload_status: UploadStatus;
  created_at: string;
  uploaded_by_id?: string | null;
  uploaded_by_name?: string | null;
  uploaded_by_email?: string | null;
  uploaded_by_is_deleted?: boolean;
  source?: string | null;
}

export type BackendTransactionType =
  | "real_estate_finance"
  | "ma"
  | "company_investment";

export interface ProjectTransactionMetadata {
  project_name?: string | null;
  client_name?: string | null;
  representing_role?: string | null;
  counterparty_name?: string | null;
  free_text_description?: string | null;
}

export interface Project {
  id: string;
  title: string;
  description?: string;
  status: ProjectStatus;
  pipeline_stage?: string | null;
  transaction_type?: BackendTransactionType | string;
  transaction_metadata?: ProjectTransactionMetadata | null;
  created_at: string;
  updated_at: string;
  files: ProjectFile[];
  dd_checks: DDCheckSummary[];
  /** Present on GET single project: "owner" | "viewer" */
  current_user_role?: "owner" | "viewer" | null;
  owner_name?: string | null;
  owner_email?: string | null;
  owner_is_deleted?: boolean;
}

export interface ProjectListMember {
  email: string;
  name: string | null;
  is_deleted?: boolean;
}

export interface ProjectListItem {
  id: string;
  title: string;
  status: string;
  created_at: string;
  file_count: number;
  transaction_type: string;
  members: ProjectListMember[];
  block?: string | null;
  parcel?: string | null;
}

export interface ProjectMember {
  user_id: string;
  email: string;
  name: string | null;
  role: "owner" | "viewer";
  is_deleted?: boolean;
}

export interface DashboardStats {
  total_projects: number;
  completed_projects: number;
  dd_checks_in_progress: number;
  dd_checks_completed: number;
  documents_scanned: number;
}

/** @deprecated Use Project instead */
export interface Transaction {
  id: string;
  title: string;
  description?: string;
  status: TransactionStatus;
  created_at: string;
  completed_at?: string;
  documents: DocumentMeta[];
}

export interface DocumentMeta {
  id: string;
  original_filename: string;
  doc_type: DocumentType;
  page_count?: number;
  file_size_bytes?: number;
  uploaded_at: string;
}

// ============================================================
// Upload flow (GCS resumable)
// ============================================================

export interface UploadInitiateRequest {
  project_id: string;
  filename: string;
  content_type: string;
  doc_type: DocumentType;
  file_size?: number;
  /** Optional folder name for GCS sub-path organisation. */
  folder?: string;
}

export interface UploadInitiateResponse {
  /** Null when already_exists=true — no GCS upload needed. */
  upload_url: string | null;
  file_id: string;
  gcs_uri: string;
  max_size_bytes: number;
  bucket_location: string;
  /** True when an identical file (same name + size) is already in the project. */
  already_exists?: boolean;
}

export interface UploadCompleteRequest {
  file_id: string;
  file_size_bytes: number;
}

export interface UploadCompleteResponse {
  file_id: string;
  gcs_uri: string;
  upload_status: string;
}

// ============================================================
// Settings
// ============================================================

export type DealType = "real_estate" | "ma" | "company_investment" | "other";

export interface AiPromptsResponse {
  prompts: Record<AiPromptKey, string>;
}

export type RealEstateType =
  | "apartment_sale"
  | "urban_renewal"
  | "project_finance";

export type AiPromptKey =
  | "ma"
  | "company_investment"
  | "other"
  | "real_estate"
  | "real_estate.apartment_sale"
  | "real_estate.urban_renewal"
  | "real_estate.project_finance";

// Agent prompt file management
export interface AgentPromptEntry {
  file_key: string;
  label_he: string;
  content: string;
}

export interface AgentPromptsListResponse {
  transaction_type: string;
  prompts: AgentPromptEntry[];
}

export interface AgentSchemaResponse {
  file_key: string;
  schema: Record<string, unknown>;
}

export interface AgentPydanticResponse {
  file_key: string;
  pydantic_source: string;
}

// ============================================================
// ADK Session events (POST-CHECK diagnostics)
// ============================================================

export interface AgentSessionEvent {
  id: string | null;
  author: string | null;
  timestamp: number | null;
  invocation_id: string | null;
  text: string | null;
  raw: Record<string, unknown>;
}

export interface AgentSessionEventsResponse {
  agent_session_id: string | null;
  judge_session_id: string | null;
  agent_events: AgentSessionEvent[];
  judge_events: AgentSessionEvent[];
}
