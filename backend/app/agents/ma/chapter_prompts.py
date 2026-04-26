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
    CHAPTER_CHANNEL_RESELLER_PARTNER,
    CHAPTER_CORPORATE_GOVERNANCE,
    CHAPTER_CUSTOMER_OBLIGATIONS,
    CHAPTER_FINANCIAL_DEBT,
    CHAPTER_HR,
    CHAPTER_INSURANCE,
    CHAPTER_IP_LICENSING,
    CHAPTER_IP_OWNERSHIP,
    CHAPTER_LITIGATION,
    CHAPTER_OSS,
    CHAPTER_REGULATORY,
    CHAPTER_SUPPLIER_OBLIGATIONS,
    CHAPTER_TAXATION,
    CHAPTER_TECHNOLOGY_PRODUCT,
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
    CHAPTER_CHANNEL_RESELLER_PARTNER: {
        "subsections": """\
Subsections:
- Contract Profile and Territory
- Commercial Model and KPIs
- Exclusivity and Restrictions
- Term, Renewal, and Termination
- Change of Control and Assignment
- Branding, IP, and Marketing
- Compliance and Regulatory
- Internal Inconsistencies and Gaps
""",
        "focus": """\
# Extraction scope (Channel/Reseller/Partner Contracts anchor)

HARD RULES: Use ONLY the provided documents. Do not infer missing values —
output "unknown" for fields not explicitly stated. Evidence is mandatory for
every material item: include source_document_name, page_number, and box_2d.
Identify executed status: "executed" ONLY if signatures/signature blocks are
present; "not_executed" ONLY if explicitly stated as draft; else "unknown".
If the document is an Amendment/Addendum/Side Letter/SOW, extract what it
amends, precedence rules, and specific changed terms.

Extract under the following categories:
A) Contract profile — document type (reseller/distributor/referral/OEM/
   strategic partnership/marketplace); parties and roles; territory and
   channel scope; products/services covered.
B) Commercial model — discount/margin/commission/referral/revenue-share
   structure; minimum commitments, sales targets, quotas, KPI requirements;
   reporting and audit rights.
C) Exclusivity and restrictions — exclusive/non-exclusive; scope and
   exceptions; non-compete/channel conflict restrictions; price restrictions
   (MAP, price floors/ceilings, parity, discount controls); territory/
   customer segment restrictions.
D) Term, renewal, and termination — term, renewal, auto-renew, notice window;
   termination for convenience (who, notice, fees, post-termination duties);
   termination for cause (grounds, cure, KPI failure triggers).
E) Change of control and assignment — CoC definition, effects, consent/notice,
   termination; assignment restrictions including by operation of law, merger.
F) Branding, IP, and marketing — trademark/brand usage license (scope,
   guidelines, approvals); marketing obligations, co-marketing, publicity;
   IP ownership of jointly developed materials.
G) Compliance — anti-bribery, export controls, sanctions, data/privacy
   obligations.

In addition to the standard summary_he / findings / follow_ups fields, also
populate the ``channel_reseller_partner_extraction`` field with the structured
extraction object matching the ChannelResellerPartnerExtraction schema.
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
    CHAPTER_TECHNOLOGY_PRODUCT: {
        "subsections": """\
Subsections:
- Document Profile and Scope
- Deliverables and Acceptance
- Service Levels and Operational Commitments
- Penalties, Credits, and Remedies
- Warranties and Performance Assurances
- Security and Compliance Commitments
- EOL / EOS and Sunsetting
- Key Personnel Commitments
- Internal Inconsistencies and Gaps
""",
        "focus": """\
# Extraction scope (Technology & Product Commitments anchor)

HARD RULES: Use ONLY the provided documents. Do not infer missing values —
output "unknown" for fields not explicitly stated. Evidence is mandatory for
every material item: include source_document_name, page_number, and box_2d.
Identify executed status: "executed" ONLY if signatures/signature blocks are
present; "not_executed" ONLY if explicitly stated as draft; else "unknown".
If commitments are referenced but not fully described (e.g. "per roadmap"),
extract the reference and mark details as "unknown".

Extract under the following categories:
A) Document profile — document type (roadmap commitment/SOW-deliverables/
   support policy/EOL-EOS/warranty terms/security commitment); products/
   services covered; linkage to master agreement; precedence rules.
B) Deliverables and acceptance — specific deliverables (features,
   integrations, milestones); delivery timelines/milestones; dependencies;
   acceptance criteria and acceptance process; deemed acceptance.
C) Service levels and operational commitments — SLA commitments stricter than
   standard; support hours, response times, escalation; availability
   commitments; maintenance windows; dedicated resources.
D) Penalties, credits, and remedies — LDs, penalties, service credits, fee
   reductions, termination rights tied to performance; caps/limits.
E) Warranties and performance assurances — warranties (conformity, non-
   infringement, security, uptime); warranty period; remedies (repair/replace/
   refund/credits); disclaimers and exclusions.
F) Security and compliance — security measures (encryption, access controls);
   standards/certifications (SOC2/ISO); vulnerability remediation timelines;
   breach notification timing; customer audit rights.
G) EOL/EOS/sunset — notice period; support continuation; migration assistance;
   backward compatibility.
H) Key personnel / dedicated team — named resources, minimum staffing,
   dedicated CSM/engineer, replacement rights.

In addition to the standard summary_he / findings / follow_ups fields, also
populate the ``technology_product_extraction`` field with the structured
extraction object matching the TechnologyProductCommitmentsExtraction schema.
""",
    },
    CHAPTER_IP_OWNERSHIP: {
        "subsections": """\
Subsections:
- Document Profile and Parties
- IP Assets Covered
- Ownership and Assignment Mechanics
- License-backs and Retained Rights
- Third-Party and Background IP
- Moral Rights
- Confidentiality and Trade Secrets
- Joint Development and Joint Ownership
- Internal Inconsistencies and Gaps
""",
        "focus": """\
# Extraction scope (IP Ownership & Transfers anchor)

HARD RULES: Use ONLY the provided documents. Do not infer missing values —
output "unknown" for fields not explicitly stated. Evidence is mandatory for
every material item: include source_document_name, page_number, and box_2d.
Identify executed status: "executed" ONLY if signatures/signature blocks are
present; "not_executed" ONLY if explicitly stated as draft; else "unknown".
If the document lists IP assets without identifiers (application/registration
numbers), extract what is present and set missing identifiers to "unknown".

Extract under the following categories:
A) Document profile — document type (employee invention assignment/contractor
   IP assignment/IP assignment deed/development agreement/joint development
   agreement/IP registration extract/IP schedule); parties (assignor/assignee/
   developer/client/joint owners); effective date.
B) IP assets covered — for each asset: IP type (patent/trademark/copyright/
   software/database/trade secret/know-how/domain name); title; application/
   registration number; jurisdiction; filing date; scope description.
C) Chain of title / ownership — assignment language type (present/future/
   mixed); "hereby assigns" vs "will assign"; works-made-for-hire language;
   further assurances obligation; power of attorney.
D) Third-party created IP — background IP, pre-existing IP, open source
   references; license-backs or retained rights by assignor; field-of-use
   limits; exclusivity.
E) Moral rights — waiver or consent; attribution; right of integrity (only if
   stated).
F) Confidentiality / trade secrets — obligations tied to IP creation or
   transfer.
G) Joint development / joint ownership — ownership allocation; exploitation
   rights; prosecution/enforcement rights; accounting/royalties.

In addition to the standard summary_he / findings / follow_ups fields, also
populate the ``ip_ownership_extraction`` field with the structured extraction
object matching the IpOwnershipTransfersExtraction schema.
""",
    },
    CHAPTER_IP_LICENSING: {
        "subsections": """\
Subsections:
- License Profile and Direction
- Scope and Restrictions
- Commercials and Royalties
- Change of Control and Assignment
- Termination and Effects
- Source Code Escrow
- Internal Inconsistencies and Gaps
""",
        "focus": """\
# Extraction scope (IP Licensing — Inbound/Outbound anchor)

HARD RULES: Use ONLY the provided documents. Do not infer missing values —
output "unknown" for fields not explicitly stated. Evidence is mandatory for
every material item: include source_document_name, page_number, and box_2d.
Identify executed status: "executed" ONLY if signatures/signature blocks are
present; "not_executed" ONLY if explicitly stated as draft; else "unknown".
If license terms are incorporated by reference (e.g. "per standard terms"),
extract the reference and mark details as "unknown" unless the actual terms
are in the provided documents.

Extract under the following categories:
A) License profile — inbound (company is licensee) or outbound (company is
   licensor); document type (software/content/database/SDK/OEM/franchise/
   sublicense); parties (licensor/licensee/sublicensor); licensed subject
   matter; effective date; term and renewal; auto-renew.
B) Scope and restrictions — field-of-use; territory; exclusivity;
   sublicensing (permitted, conditions); distribution/resale/OEM rights;
   modification/derivative works restrictions; usage limits; audit and
   reporting obligations.
C) Commercials / royalties — fees/royalties (rate/base); minimum royalties;
   reporting schedule; audit/true-up; payment terms; late fees; taxes.
D) Change of control and assignment — CoC definition, effects, consent/notice,
   termination; assignment restrictions including by operation of law, merger,
   substantially all assets; merger treated as assignment.
E) Termination and effects — termination for convenience (who, notice, fees);
   termination for cause (grounds, cure); effects of termination (sell-off/
   wind-down period, continued use, return/destruction, transition assistance,
   survival terms).
F) Source code escrow — existence, escrow agent, release triggers, update
   deposit obligations, access conditions.

In addition to the standard summary_he / findings / follow_ups fields, also
populate the ``ip_licensing_extraction`` field with the structured extraction
object matching the IpLicensingExtraction schema.
""",
    },
    CHAPTER_OSS: {
        "subsections": """\
Subsections:
- Document Profile and Tooling
- Component Inventory
- Copyleft / Reciprocal License Analysis
- OSS Policy and Process
- Obligations and Notices
- Risks and Non-compliance Issues
- Internal Inconsistencies and Gaps
""",
        "focus": """\
# Extraction scope (Open Source & Third-Party Components anchor)

HARD RULES: Use ONLY the provided documents. Do not use external knowledge
(including general OSS knowledge beyond what is explicitly stated).
Do not infer missing values — output "unknown" for fields not explicitly
stated. Evidence is mandatory for every material item: include
source_document_name, page_number, and box_2d.
If a component name/version/license is in tabular form, extract it
faithfully. If text is partial due to OCR, extract what is present and set
missing fields to "unknown".

Extract under the following categories:
A) Document profile — document type (OSS inventory/SBOM/OSS policy/OSS
   notices); covered products/repos/versions; tooling/scanners mentioned.
B) Component list — for each component explicitly listed: name, version,
   supplier/source, license(s), usage context (product/module), whether
   modified (if stated), whether distributed (if stated).
C) Copyleft identification — ONLY if the document explicitly labels a license
   as "copyleft" or lists a "copyleft" category: capture that classification
   and any stated implications.
D) Obligations (as stated) — disclosure obligations (source code, written
   offer); attribution obligations; requirements triggered by distribution/
   SaaS/modification/linking; internal process obligations.
E) Risks and exceptions (as stated) — injunction risk, source code disclosure
   risk, license incompatibility, non-compliance issues, remediation plans,
   deadlines.

In addition to the standard summary_he / findings / follow_ups fields, also
populate the ``oss_extraction`` field with the structured extraction object
matching the OssExtraction schema.
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
