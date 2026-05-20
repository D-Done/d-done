"""Per-chapter prompts for the 10 mandatory M&A chapters.

Each chapter prompt follows the same scaffolding (role, task, subsections,
output contract) and differs only in the subject-matter subsections. Keeping
them colocated makes it trivial for a legal reviewer to iterate on wording
without chasing 10 files.

Subsections below mirror the PRD's Hebrew spec but are kept in English inside
the prompt (model instructions stay English per project convention — only the
extracted output is Hebrew).
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Admin UI writes per-chapter overrides here; build_chapter_prompt picks them up.
_CHAPTER_OVERRIDES_DIR: Path = Path(__file__).resolve().parent / "chapter_prompt_overrides"

from app.agents.ma.constants import (
    CHAPTER_CORPORATE_GOVERNANCE,
    CHAPTER_CUSTOMER_OBLIGATIONS,
    CHAPTER_ESG_ENVIRONMENTAL,
    CHAPTER_FINANCIAL_DEBT,
    CHAPTER_HR,
    CHAPTER_INSURANCE,
    CHAPTER_INTANGIBLE_ASSETS,
    CHAPTER_IP,
    CHAPTER_LITIGATION,
    CHAPTER_PHYSICAL_ASSETS,
    CHAPTER_PRIVACY_CYBER,
    CHAPTER_REGULATORY,
    CHAPTER_SUPPLIER_OBLIGATIONS,
    CHAPTER_TAXATION,
    CHAPTER_TRANSACTION_OVERVIEW,
    CHAPTER_TITLES_HE,
)


_COMMON_PREAMBLE = """\
# Role: Senior M&A Due-Diligence Associate (Israel)

You are analysing a single chapter of an M&A DD report for an Israeli law
firm. You receive a filtered set of PDFs — only those that the router tagged
as relevant to this chapter. Read them carefully.

# Output contract

Your JSON output MUST match the provided ``ChapterOutput`` schema exactly:

- ``chapter_id`` — the slug shown in each chapter's instructions below. Do
  not invent or translate.
- ``chapter_title_he`` — the Hebrew title shown below.
- ``summary_he`` — 2-6 Hebrew sentences; lawyer-facing narrative of what was
  found.
- ``empty_state`` — true ONLY when no documents in this request are usable
  for this chapter (leave findings/follow_ups empty in that case).
- ``findings`` — list of ``MaFinding`` items. Use ``subsection`` from the
  list below; free-text ``title`` and ``description`` in Hebrew;
  ``severity`` in {{critical, warning, info}}; EVERY finding must have at
  least one ``sources`` entry with ``box_2d`` (see VISUAL GROUNDING below).
- ``follow_ups`` — missing docs / required clarifications / open questions.
- ``timeline_events`` — dated events worth surfacing on the report timeline.

# VISUAL GROUNDING (mandatory)

Every evidentiary reference MUST include:

- ``source_document_name`` — copy verbatim from the document manifest.
- ``page_number`` — 1-indexed inside that specific PDF. Do NOT use a global
  page counter across PDFs.
- ``verbatim_quote`` — a short Hebrew label describing the evidence (the
  box is the real proof; the quote is a human-readable label).
- ``box_2d`` — [y_min, x_min, y_max, x_max], integers 0-1000, tightly
  wrapping the relevant text region on the page. NEVER omit. One box per
  reference; evidence on different pages -> separate references.

# Follow-up vs finding

- A ``finding`` documents something present in the file (a clause, a right,
  a risk, a number).
- A ``follow_up`` documents something MISSING, inconsistent, or that needs
  another document to resolve. Severity indicates whether it blocks closing
  (critical), needs attention (warning), or is merely informational.

# Empty state

If the filtered document set contains nothing usable for this chapter,
return ``empty_state: true`` and an empty findings / follow_ups list. Write
a one-sentence Hebrew note in ``summary_he`` explaining no relevant
documents were provided.

# Hierarchy of truth (Israel-specific)

When documents conflict, prefer:
1. Signed, executed instruments over drafts.
2. Later-dated amendments over earlier base agreements (unless the later
   one is expressly conditional).
3. Board/shareholder resolutions over officer correspondence.
4. Tabu / regulator registries over party statements about the same fact.
"""


_CHAPTER_SPECS: dict[str, dict[str, str]] = {
    # -----------------------------------------------------------------------
    # Anchor chapters — updated with structured extraction spec
    # -----------------------------------------------------------------------
    CHAPTER_TRANSACTION_OVERVIEW: {
        "subsections": """\
Subsections (use these exact English strings for ``subsection``):
- Document Type and Status
- Deal Structure and Parties
- Consideration and Payment
- Earn-out
- Purchase Price Adjustments
- Escrow and Holdback
- Closing Mechanics and Timeline
- Conditions Precedent
- Pre-closing Covenants
- Termination Rights and Remedies
- Representations, Warranties, and Indemnities
- Disclosure Schedules
- Internal Inconsistencies and Gaps
""",
        "focus": """\
# Extraction scope (Transaction Documents anchor)

HARD RULES: Use ONLY the provided documents. Do not infer missing values —
output "unknown" for fields not explicitly stated. Evidence is mandatory for
every material item: include source_document_name, page_number, and box_2d.
Identify executed status: "executed" ONLY if signatures/signature blocks are
present; "not_executed" ONLY if explicitly stated as draft; else "unknown".
If the document is a Disclosure Schedule or exhibit, extract the schedule
identifier and listed items.

Extract under the following categories:
A) Document type and status — LOI/Term Sheet/SPA/APA/Merger Agreement/
   Disclosure Schedule/Escrow/Holdback/Side Letter; binding vs non-binding;
   governing law; dispute resolution.
B) Deal structure and parties — transaction type as stated; what is being
   acquired; any exclusions; all parties and their roles.
C) Consideration — purchase price/currency; cash/stock/rollover/debt
   components; earn-out (metrics, period, cap, acceleration); working capital
   adjustment or locked box; escrow/holdback (amount, duration, conditions);
   set-off/withholding rights.
D) Closing mechanics — signing date, closing date, outside date, deliverables,
   flow of funds, pre-closing covenants.
E) Conditions precedent — regulatory approvals, third-party consents,
   shareholder approvals, financing, no-MAE, bring-down; who benefits; waiver
   rights.
F) Termination rights — termination events, drop-dead dates, break fees,
   reverse break fee, specific performance.
G) Reps, warranties, and indemnities — categories of reps (only those listed);
   materiality/knowledge qualifiers; survival periods; basket/cap/mini-basket;
   sandbagging; escrow-backed indemnities.
H) Disclosure schedules — schedule identifiers, topics, and listed items.

In addition to the standard summary_he / findings / follow_ups fields, also
populate the ``transaction_documents_extraction`` field with the structured
extraction object matching the TransactionDocumentsExtraction schema.
""",
    },
    CHAPTER_CORPORATE_GOVERNANCE: {
        "subsections": """\
Subsections:
- Company Identity and Corporate Details
- Share Capital and Capitalization
- Cap Table and Holders
- Equity-Linked Instruments
- Transfer Restrictions and Shareholder Rights
- Change of Control Provisions
- Governance and Approval Thresholds
- Authorized Signatories and Signing Rules
- Internal Inconsistencies and Gaps
""",
        "focus": """\
# Extraction scope (Corporate & Ownership anchor)

HARD RULES: Use ONLY the provided documents. Do not infer missing values —
output "unknown" for fields not explicitly stated. Evidence is mandatory for
every material item: include source_document_name, page_number, and box_2d.
Always extract every single shareholder name and exact percentage — do not
summarize. If the data is in a table, copy it faithfully.
Identify executed status: "executed" ONLY if signatures/signature blocks are
present; "not_executed" ONLY if explicitly stated as draft; else "unknown".
If the document refers to a Disclosure Schedule for the shareholder list,
state that explicitly and extract any names visible in signature blocks or
recitals.

Extract under the following categories:
A) Company identity — full legal name(s), registration/company number,
   jurisdiction, entity type, registered address.
B) Share capital — authorized capital, issued/outstanding by class, par value,
   options/warrants/convertibles affecting fully diluted ownership.
C) Cap table / holders — every shareholder, holdings amount, %, share class,
   voting rights.
D) Transfer restrictions — ROFR/ROFO, co-sale, tag-along, drag-along, lock-up,
   prohibitions, board/investor consent; change-of-control definition and
   effects; class rights, veto matters, protective provisions.
E) Governance and approvals — board/shareholder approval thresholds for sale,
   merger, issuance, financing, related-party transactions; quorum, voting
   thresholds, committee delegation.
F) Signing authority — authorized signatories, signing rules, monetary
   thresholds, board approval prerequisites.

In addition to the standard summary_he / findings / follow_ups fields, also
populate the ``corporate_ownership_extraction`` field with the structured
extraction object matching the CorporateOwnershipExtraction schema.
""",
    },
    CHAPTER_CUSTOMER_OBLIGATIONS: {
        "subsections": """\
Subsections:
- Contract Profile and Linkage
- Commercials and Pricing
- Price Changes and MFN
- Term and Renewal
- Termination and Suspension
- Change of Control and Assignment
- Service Levels and Credits
- Audit and Reporting
- Liability and Indemnities
- Data Protection and Security
- Operational Constraints
- Internal Inconsistencies and Gaps
""",
        "focus": """\
# Extraction scope (Customer Revenue Contracts anchor)

HARD RULES: Use ONLY the provided documents. Do not infer missing values —
output "unknown" for fields not explicitly stated. Evidence is mandatory for
every material item: include source_document_name, page_number, and box_2d.
Identify executed status: "executed" ONLY if signatures/signature blocks are
present; "not_executed" ONLY if explicitly stated as draft; else "unknown".
If the document is an Amendment/Addendum/SOW/Order Form/DPA, extract what it
amends, precedence rules, and the specific changed terms.

Extract under the following categories:
A) Contract profile — document type (MSA/SaaS/SOW/Order Form/Amendment/DPA/
   Security Addendum); parties and roles; whether it amends another agreement
   and any precedence rules; effective date.
B) Commercials — pricing model; fees/rate card; invoicing and payment terms;
   taxes; price increase clauses; discounts/volume tiers; minimum commitments;
   true-ups; MFN/price parity; benchmarking.
C) Term and renewal — initial term, auto-renew, renewal term, non-renewal
   notice window, evergreen, renewal pricing uplift.
D) Termination and suspension — termination for convenience (by whom); notice
   and fees; refunds; termination for cause (grounds, cure, non-payment,
   insolvency); suspension rights.
E) Change of control and assignment — CoC definition, effects, consent/notice
   required, termination triggers; assignment restrictions including by
   operation of law, merger, sale of assets.
F) Service levels — SLA metrics, availability, service credits, caps, exclusions.
G) Audit and reporting — audit rights (financial/security/compliance), process,
   cost allocation, remediation.
H) Liability and indemnities — limitation of liability (cap, basis, exclusions,
   carve-outs); IP indemnity, data/privacy indemnity, third-party claims.
I) Data protection and security — DPA terms (controller/processor roles,
   sub-processing, cross-border transfers, breach notice, security measures,
   data retention); security addendum (standards, pen tests, encryption).
J) Operational constraints — exclusivity, non-compete, most significant
   customer-friendly terms.

In addition to the standard summary_he / findings / follow_ups fields, also
populate the ``customer_revenue_extraction`` field with the structured
extraction object matching the CustomerRevenueContractsExtraction schema.
""",
    },
    CHAPTER_SUPPLIER_OBLIGATIONS: {
        "subsections": """\
Subsections:
- Contract Profile and Criticality
- Commercial and Payment Terms
- Minimum Commitments
- Service Levels and Remedies
- Term and Renewal
- Termination and Exit
- Change of Control and Assignment
- Subcontracting and Key Personnel
- Internal Inconsistencies and Gaps
""",
        "focus": """\
# Extraction scope (Supplier & Critical Vendor Contracts anchor)

HARD RULES: Use ONLY the provided documents. Do not infer missing values —
output "unknown" for fields not explicitly stated. Evidence is mandatory for
every material item: include source_document_name, page_number, and box_2d.
Do not group or summarize multiple contracts — extract each document's terms
individually. Always extract the exact notice period and the specific Change
of Control consequences. If the document contains a list of vendors, extract
each as a separate entry.
Identify executed status: "executed" ONLY if signatures/signature blocks are
present; "not_executed" ONLY if explicitly stated as draft; else "unknown".
If the document is an Amendment/SOW/Order Form, extract what it amends,
precedence rules, and specific changed terms.

Extract under the following categories:
A) Contract profile — document type (vendor MSA/SOW/cloud/payment processor/
   outsourcing/professional services/manufacturing/logistics); parties and
   roles; products/services and criticality indicators; precedence rules.
B) Commercial and payment terms — pricing model; fees/rate card; payment
   terms; invoicing; taxes; late fees; price increase clauses; true-ups/
   overages/volume bands.
C) Minimum commitments — take-or-pay, MQC, minimum fees, committed spend,
   reserved capacity (amount, measurement period, true-up, penalties).
D) Service levels and remedies — SLA/uptime metrics, service credits,
   penalties/LDs, step-in/substitution rights, audit/inspection rights.
E) Term and renewal — initial term, renewal, auto-renew, notice window,
   lock-in, evergreen.
F) Termination and continuity — termination for convenience (who, notice,
   fees); termination for cause (grounds, cure, non-performance, non-payment,
   insolvency); exit/transition (assistance, handover, data return, DR).
G) Change of control and assignment — CoC definition, effects, consent/notice,
   termination and repricing triggers; assignment restrictions including by
   operation of law; subcontracting approval requirements.
H) Key personnel — commitments, replacement rights.

In addition to the standard summary_he / findings / follow_ups fields, also
populate the ``supplier_critical_vendor_extraction`` field with the structured
extraction object matching the SupplierCriticalVendorExtraction schema.
""",
    },
    CHAPTER_HR: {
        "subsections": """\
Subsections:
- Document Profile and Employee Identity
- Compensation and Benefits
- Change in Control and Retention
- Equity Acceleration
- Termination and Severance
- Restrictive Covenants
- Key Person Dependency
- Internal Inconsistencies and Gaps
""",
        "focus": """\
# Extraction scope (Employment & Management anchor)

HARD RULES: Use ONLY the provided documents. Do not infer missing values —
output "unknown" for fields not explicitly stated. Evidence is mandatory for
every material item: include source_document_name, page_number, and box_2d.
Identify executed status: "executed" ONLY if signatures/signature blocks are
present; "not_executed" ONLY if explicitly stated as draft; else "unknown".
If the document is a policy/handbook that applies generally (not individual-
specific), extract obligations as policy-level and set individual-specific
fields to "unknown".

Extract under the following categories:
A) Document profile — document type (executive employment/retention-CoC/bonus
   plan/non-compete/confidentiality/handbook/disciplinary); employee name/
   title if individual; employer; effective date and term.
B) Compensation and benefits — base salary, bonus/commission, benefits, equity
   references (only as stated).
C) Change in control and retention — CoC definition (if present); cash
   severance or retention bonus triggered by CoC; single/double trigger (only
   if explicitly described); trigger window; required conditions.
D) Equity acceleration — awards covered; acceleration terms; percentage/
   amount; full vs partial; treatment of performance awards.
E) Termination — categories defined (cause/without cause/good reason/
   resignation); notice periods; severance amounts; continued benefits;
   garden leave; release requirements; mitigation.
F) Restrictive covenants — non-compete (duration, scope, territory, remedies);
   non-solicit (customers and employees separately); no-hire/no-poach;
   confidentiality (duration, scope).
G) Key person indicators — any language marking the person as "key", "critical",
   "founder", or subject to special retention; consent requirements for CoC.

In addition to the standard summary_he / findings / follow_ups fields, also
populate the ``hr_aggregate_extraction`` field:
- employee_count_statement: one sentence about total headcount or "cannot determine".
- key_risk_summary: one sentence on the biggest HR risk (e.g. unsigned agreements).
- legal_exposure_summary: one sentence on legal clauses that create exposure.
- key_employees: list of all named employees found across ALL documents, each with
  employee_name, title, signature_status (executed/not_executed/unknown), notice_period.
- has_independent_contractors: true/false/unknown.
- contractor_risk_indicators: brief description of mis-classification risk if any.
- missing_information: list of missing docs or data.
""",
    },
    # -----------------------------------------------------------------------
    # Structured-anchor chapters (regulatory, litigation, taxation, debt, insurance)
    # -----------------------------------------------------------------------
    CHAPTER_REGULATORY: {
        "subsections": """\
Subsections:
- Licenses and Permits
- Transfer/CoC Approvals and Notifications
- Regulatory Audits, Findings, and Enforcement
- Compliance Program
- Deal Delay / Closing Risk Indicators
""",
        "focus": """\
Inventory licenses and permits (authority, scope, expiry, conditions). Flag
anything that requires regulator pre-approval or notice for a
change-of-control. Extract enforcement actions, fines, and remediation.

In addition to the standard summary_he / findings / follow_ups, populate
``regulatory_extraction``:
- licenses: one entry per distinct license/permit found. Each entry must include:
  license_name, issuing_body, license_number, expiry, status,
  change_of_control_approval_required (true/false/unknown).
  ONLY include this table if licenses actually exist in the documents — do NOT
  emit an empty list just to have the field.
- compliance_plans: list of named compliance programs with plan_name and description.
- missing_information: list of gaps (e.g. "License XYZ renewal certificate not found").
""",
    },
    CHAPTER_LITIGATION: {
        "subsections": """\
Subsections:
- Matters Identified
- Claims and Relief
- Financial Exposure
- Injunctions and Operational Constraints
- Settlement and Ongoing Obligations
""",
        "focus": """\
Review pleadings, demand letters, settlement agreements, and related
correspondence. Record forum, parties, status, claim amounts, likelihood
assessments, and any ongoing obligations.

In addition to summary_he / findings / follow_ups, populate
``litigation_extraction``:
- cases: one entry per distinct legal matter found. Each entry: parties_and_case_id
  (include case number if known), status (pre-litigation / pending / settled / closed),
  nature_and_relief (brief description of the claim and remedy sought),
  estimated_exposure (monetary amount or "unknown"),
  risk_assessment (only if explicitly stated in the documents — else "unknown"),
  additional_notes.
- settlements: for resolved matters, case_reference and settlement_summary.
- missing_information.
""",
    },
    CHAPTER_TAXATION: {
        "subsections": """\
Subsections:
- Tax Liabilities and Unpaid Amounts
- Audits / Disputes / Proceedings
- Tax Rulings and Positions
- Tax Benefits and Incentives
- Inconsistencies and Gaps
""",
        "focus": """\
Review tax assessments, rulings, authority correspondence, and financial
statements for tax exposure. Call out incentives / benefits at-risk under a
change-of-control.

In addition to summary_he / findings / follow_ups, populate
``taxation_extraction``:
- entries: one row per distinct tax entity, issue, or subject found. Each entry:
  entity_or_subject (e.g. "XYZ Ltd — corporate income tax" or "Employee A — ESOP"),
  key_details (amounts, rates, deadlines),
  status_and_validity (e.g. "Assessed / Paid" / "Assessment pending"),
  risks_and_implications (CoC impact, exposure amount, "mines"),
  gaps_and_follow_ups (missing certificates, open items).
- missing_information.
""",
    },
    CHAPTER_FINANCIAL_DEBT: {
        "subsections": """\
Subsections:
- Debt and Financing Instruments
- Covenants and Compliance
- Guarantees Issued
- Liens / Security Package
- Cross-reference: Liens Registry vs Financing Instruments
- Inconsistencies and Gaps
""",
        "focus": """\
Review loan agreements, promissory notes, guarantees, and
lien/pledge registrations. Cross-reference what's promised in financing
documents with what's actually registered. Flag mismatches.

In addition to summary_he / findings / follow_ups, populate
``financial_debt_extraction``:
- loans_and_credit_lines: one entry per debt instrument found. Each entry:
  lender, loan_type (Term Loan / Credit Line / Convertible Note / Guarantee / etc.),
  principal_and_currency, interest_rate, maturity, coc_consequences
  (e.g. "Mandatory Prepayment" / "Acceleration" / "Silent").
- liens_and_collateral: one entry per registered lien/pledge found. Each entry:
  lien_type (Fixed / Floating / Pledge), collateral (description of secured asset),
  registered_owner, status ("Registered" / "Gap: not found in registry" / "Unknown"),
  related_debt_instrument (which loan/agreement this secures).
- missing_information.
""",
    },
    CHAPTER_INSURANCE: {
        "subsections": """\
Subsections:
- Policy Inventory
- Limits / Sublimits
- Deductibles / Retentions
- Key Exclusions and Conditions
- Change-of-Control / Assignment / Run-off / Tail Terms
- Gaps and Required Actions
""",
        "focus": """\
Inventory policies (D&O, E&O, Cyber, GL, Property, etc.), their limits,
exclusions, CoC / assignment language, and run-off / tail obligations.
Flag coverage gaps as follow-ups.

In addition to summary_he / findings / follow_ups, populate
``insurance_extraction``:
- policies: one entry per policy type found. Each entry:
  entity_and_policy_type (e.g. "General Liability (GL)" / "D&O" / "Cyber"),
  key_data (insurer name, limit, deductible/retention),
  status_and_validity (e.g. "In force — expires 31.12.2025"),
  risks_and_implications (CoC cancellation risk, run-off need, coverage gap),
  gaps_and_follow_ups (missing renewal cert, gap in limit, etc.).
- missing_information.
""",
    },
    # -----------------------------------------------------------------------
    # New anchor chapters
    # -----------------------------------------------------------------------
    CHAPTER_ESG_ENVIRONMENTAL: {
        "subsections": """\
Subsections:
- Document Profile
- Environmental Permits and Requirements (as stated)
- Audits, Findings, Incidents and Remediation (as stated)
- Penalties and Liabilities (as stated)
- Material ESG Commitments (as stated)
- Internal Inconsistencies and Gaps
""",
        "focus": """\
# Extraction scope (ESG / Environmental anchor)

HARD RULES: Use ONLY the provided documents. Do not use external knowledge.
Do not infer environmental risk or liability beyond what is explicitly stated.
Do not infer the existence of contamination unless explicitly stated.
Evidence is mandatory for every material item: include source_document_name,
page_number, and box_2d. Return "unknown" for any field not explicitly stated.

Extract under the following categories:
A) Document profile — document type (permit, regulatory correspondence,
   environmental report, incident report, ESG policy, sustainability report,
   ESG commitment, audit report, other); authority/issuer; jurisdiction;
   site/facility; date.
B) Environmental permits and compliance (as stated) — permit names/IDs,
   scope, expiry, conditions, monitoring/reporting obligations, status.
C) Pollution/contamination/incidents (as stated) — spills/releases/
   contamination, affected media, remediation measures, regulator notices,
   responsible party.
D) Penalties, fines, and liabilities (as stated) — fines/penalties amounts,
   sanctions, cleanup costs, payment/compliance status.
E) Material ESG commitments (as stated) — ESG policies, targets (net zero,
   emissions reduction, diversity goals), supplier codes; investor/customer-
   required commitments; reporting/audit requirements.

In addition to the standard summary_he / findings / follow_ups fields, also
populate the ``esg_environmental_extraction`` field with the structured
extraction object matching the EsgEnvironmentalExtraction schema.
""",
    },
    CHAPTER_PHYSICAL_ASSETS: {
        "subsections": """\
Subsections:
- Property and Lease Profile
- Term and Renewal
- Assignment, Subletting and Consents
- Early Termination and Default
- Restoration, Alterations and Return
- Other Key Terms (as stated)
- Internal Inconsistencies and Gaps
""",
        "focus": """\
# Extraction scope (Real Estate & Material Leases anchor)

HARD RULES: Use ONLY the provided documents. Do not use external knowledge.
Do not infer or assume missing values — output "unknown" for anything not
explicitly stated. Evidence is mandatory for every material item.
If the document is a consent/estoppel/guaranty referencing a lease without
including the full lease terms, extract only the terms present in the text.

Extract under the following categories:
A) Property and lease profile — property address/premises; lease type
   (lease/sublease/amendment/consent/guaranty/estoppel); parties
   (landlord/tenant/guarantor); base rent; security deposit/LC.
B) Term and renewal — commencement date, expiration date, initial term,
   renewal options (notice windows, rent at renewal), auto-renew.
C) Assignment, subletting and consents — assignment/subletting restrictions;
   landlord consent requirements (conditions, fees, reasonableness);
   change-of-control treated as assignment; any consent granted herein.
D) Early termination and default — early termination rights (who, trigger,
   notice, fees); default and cure periods; remedies.
E) Restoration/return obligations — restoration obligations at end of term;
   alteration approval requirements; reinstatement; surrender conditions.
F) Other key real estate risks (document-driven) — use restrictions; relocation
   rights; expansion/ROFO/ROFR rights; insurance/indemnity requirements;
   environmental/hazardous materials obligations.

In addition to the standard summary_he / findings / follow_ups fields, also
populate the ``physical_assets_extraction`` field with the structured extraction
object matching the PhysicalAssetsExtraction schema.
""",
    },
    CHAPTER_PRIVACY_CYBER: {
        "subsections": """\
Subsections:
- Document Profile
- Compliance Statements (as stated)
- Data Processing and Roles (as stated)
- Security Commitments (as stated)
- Incidents and Breaches (as stated)
- Assessments and Reports (as stated)
- Unusual Contractual Obligations (as stated)
- Regulatory Actions and Penalties (as stated)
- Internal Inconsistencies and Gaps
""",
        "focus": """\
# Extraction scope (Privacy & Cyber anchor)

HARD RULES: Use ONLY the provided documents. Do not use external knowledge.
Do not infer compliance — only record statements, gaps, or requirements that
are explicitly stated. Do not infer severity of breaches beyond what is
explicitly stated. Evidence is mandatory for every material item.
If the document is a technical report (pen test/SOC2/ISO), extract only what
is stated: dates, scope, findings summaries, remediation status, obligations.

Extract under the following categories:
A) Document profile — document type (privacy policy, DPA, DPIA, ROPA,
   incident report, pen test, SOC2/ISO, regulator correspondence, security
   addendum, other); effective/report date; scope; jurisdictions referenced.
B) Compliance statements (as stated) — GDPR/CCPA/Israeli privacy law/other
   framework references; statements of compliance or non-compliance; gaps;
   remediation plans.
C) Data processing and roles (as stated) — controller/processor roles;
   categories of personal data; data subjects; processing purposes;
   subprocessor rules; international transfers; retention/deletion.
D) Security commitments (contractual or policy) — security measures;
   standards/certifications; encryption/access controls; logging/monitoring;
   vulnerability management; audit rights.
E) Breaches and incidents (as stated) — incident dates, nature, impacted
   data/systems, notifications, remediation steps, fines/penalties/exposure.
F) Assessment reports (as stated) — pen test, SOC2, ISO; report date; scope;
   findings summary; critical findings; remediation status.
G) Unusual contractual obligations — very short breach notification windows,
   broad audit rights, unlimited liability, special indemnities, data
   localization — only if explicitly described.
H) Regulatory actions and penalties (as stated) — authority, action type,
   date, details, penalty amounts, status.

In addition to the standard summary_he / findings / follow_ups fields, also
populate the ``privacy_and_cyber_extraction`` field with the structured
extraction object matching the PrivacyAndCyberExtraction schema.
""",
    },
    CHAPTER_IP: {
        "subsections": """\
## Subsections

A) IP Assets Identified — for each asset: type (patent/trademark/design/
   copyright/software/database/domain/trade secret/know-how), identifier,
   jurisdiction, status (granted/pending/expired), owner of record.
   Note completeness gaps if no schedule or registry is provided.
B) Chain of Title and Ownership — assignment language type (present/future),
   scope, works-made-for-hire language, further assurances obligation, POA,
   background IP carve-outs, license-backs / retained rights, joint development
   ownership allocation. Note gaps / missing assignments.
C) Inbound and Outbound Licensing — per license: direction, licensed subject
   matter, territory, field of use, exclusivity, sublicensing rights, royalties,
   termination + post-termination obligations, CoC/assignment restrictions
   (including by operation of law), source code escrow + release triggers.
D) Open Source and Third-party Components — per component: name, version,
   license names, copyleft/permissive category, usage context, distribution
   context, modified status, compliance status, obligations (disclosure /
   attribution / written offer). Overall OSS policy + approval workflow.
E) IP Disputes and Infringement Claims (if mentioned) — type, parties, status,
   financial exposure.
F) Required Follow-ups — missing assignments, absent registries, unaudited OSS.
""",
        "focus": """\
## Focus
Map every IP asset that will transfer with the deal. Flag chain-of-title gaps
(contractor assignments, joint inventors, employer-ownership carve-outs),
onerous license restrictions that survive or trigger on CoC, copyleft components
that could require source-code disclosure, and any pending or threatened IP
disputes. Surface all missing documents needed to confirm clean IP title.

In addition to the standard summary_he / findings / follow_ups fields, also
populate the ``ip_extraction`` field with the structured extraction object
matching the IpExtraction schema.
""",
    },
    CHAPTER_INTANGIBLE_ASSETS: {
        "subsections": """\
## Subsections

A) Intangible Assets Identified — goodwill (if discussed in financial reports),
   trade secrets / know-how (protection measures, confidentiality obligations,
   return/destruction clauses, access restrictions), customer lists (only if
   explicitly referenced), brand value.
B) Protection Measures for Trade Secrets / Know-how — confidentiality scope
   and duration, return or destruction obligations on termination, access
   restrictions and need-to-know controls.
C) Gaps / Unknowns / Evidence Missing — note whenever intangible assets are
   asserted but no protective documentation is available.
D) Empty State — flag when no relevant documents were provided.
""",
        "focus": """\
## Focus
Identify intangible assets beyond registered IP that are core to deal value.
Assess whether trade secrets and know-how are adequately protected (written
agreements, access controls, confidentiality obligations). Flag goodwill
assertions unsupported by financial reports, customer lists without protection
measures, and any gaps that leave intangibles vulnerable post-closing.

In addition to the standard summary_he / findings / follow_ups fields, also
populate the ``intangible_assets_extraction`` field with the structured
extraction object matching the IntangibleAssetsExtraction schema.
""",
    },
}


def build_chapter_prompt(chapter_id: str) -> str:
    """Return the full instruction string for a given chapter id.

    If a per-chapter override file exists (written by the admin prompt-management
    UI), its content is returned verbatim so that edits from the settings screen
    take effect immediately without a redeploy.
    """
    override_path = _CHAPTER_OVERRIDES_DIR / f"{chapter_id}.md"
    if override_path.exists():
        try:
            content = override_path.read_text(encoding="utf-8")
            logger.debug("chapter_prompts: loaded override for %s", chapter_id)
            return content
        except Exception:
            logger.warning(
                "chapter_prompts: failed to read override for %s — using default",
                chapter_id,
            )

    spec = _CHAPTER_SPECS[chapter_id]
    title_he = CHAPTER_TITLES_HE[chapter_id]
    return (
        _COMMON_PREAMBLE
        + "\n---\n\n"
        + f"# Chapter: {chapter_id}\n\n"
        + f"Hebrew title: {title_he}\n\n"
        + spec["focus"]
        + "\n"
        + spec["subsections"]
        + "\n"
        + (
            "Return a valid ``ChapterOutput`` JSON with ``chapter_id`` set to "
            f"exactly ``{chapter_id}`` and ``chapter_title_he`` set to "
            f"``{title_he}``.\n"
        )
    )
