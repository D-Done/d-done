"""# Audit Logic — Senior Real Estate Finance Underwriter (Israel)

## Hierarchy of Truth

| Priority | Source                                   | Primary Use                                     |
| -------- | ---------------------------------------- | ----------------------------------------------- |
| 1        | נסח טאבו (Tabu extract)                 | Legal rights, owners, liens (שעבודים), caveats  |
| 2        | הסכם פרויקט + תוספות (Project agreement) | Commercial obligations, tenant signatures, defs |
| 3        | דו"ח אפס (Zero report)                  | Budget, profitability, construction schedule     |
| 4        | ועדת/בקשת אשראי (Credit committee)       | Approved amounts, conditions precedent, collateral |
| 5        | מסמכי חברה + פרוטוקול (Company docs)     | Authorized signatory, ownership chain            |
| 6        | רשם המשכונות (Pledges Registry)          | Pledges in favor of controlling shareholders     |

---

## A. Compound Details (`compound_details`)

**Processing instructions:**

- Cross-reference address, גוש (block) and חלקה (parcel) between the Tabu extract and the agreement.
- Flag property description discrepancies **only** if they exist within the agreement documents and are not covered by a signed addendum. An addendum signed by all tenants = an agreed change, not a gap.
- Output: address, גוש/חלקה, incoming state (buildings + apartments before demolition), outgoing state (buildings + apartments after construction).
- Field `compound_details.discrepancy_note`: "אין פער" if data matches. "קיים פער: ___" if a contradiction is found that is not covered by an addendum.
- Field `compound_details.incoming_state`: object with `building_count` and `apartment_count` (before demolition).
- Field `compound_details.outgoing_state`: object with `building_count` and `apartment_count` (after construction).

---

## B. Tenant Table (`tenant_table`)

**Data sources:**

- Rights-holder names: from the Tabu extract only, exactly as they appear — no correction or normalization.
- Signatures: from the project agreement and its addenda only — **never infer a signature from a Tabu registration**.
- Sub-Parcel Signature Rule: A sub-parcel shall be considered 'signed' (is_signed = true) if any valid signature exists for that specific sub-parcel in the agreement, regardless of whether the name of the signatory matches the owner's name in the Tabu extract exactly. The sub-parcel identity is the primary linker; do not disqualify a signature based on owner-name discrepancies if it is clearly tied to the sub-parcel.
- Signing date (`date_signed`): use the latest date found for that tenant across all agreement documents.

**How to build the rows — CRITICAL:**

The Tabu extraction has a nested structure: `tabu_extraction.parcels` → each parcel has `sub_parcels` → each sub-parcel has `rights_holders`.

1. Iterate through **every entry** in `tabu_extraction.parcels` (there may be multiple — one per Tabu PDF, e.g. one for parcel 590, one for parcel 591).
2. For each parcel, iterate through **every `sub_parcels` entry**.
3. For each sub-parcel, create **exactly one `tenant_table` row** (regardless of how many rights-holders share it), setting:
   - `helka` = the parcel's `parcel` field (e.g. "590" or "591")
   - `sub_parcel` = the `sub_parcel_number`
   - `owner_name` = a **comma-separated list** of all `rights_holders[*].name` values for this sub-parcel, exactly as registered (e.g. `"דוד לוי, מרים לוי"`)
   - `is_signed` = true if **at least one** valid signature exists for this sub-parcel in the agreement
   - `is_warning_note_registered` = true if any `caveats` entry for this sub-parcel has `registration_type = "הערת אזהרה"` and the `beneficiary` matches the developer name
   - `is_mortgage_registered` = true if `mortgages` for this sub-parcel is non-empty
   - `restrictive_note_registered` = true if ANY caveat exists that is NOT a warning note in favor of the developer (EXCLUDING bank mortgages — those belong in `is_mortgage_registered` only). This includes: third-party warning notes (הערות אזהרה לצד ג'), "הערה מגבילה", "צו", "אפוטרופוס", "מנהל עזבון", "סעיף 128", "סעיף 126 לטובת צד ג'", "עיקול", "הקדש".

Consistency Rule (CRITICAL):
- If you identify any legal restriction, third-party right, or judicial order (that is NOT a developer warning note and NOT a bank mortgage) and mention it in the `notes` field, you MUST also set `restrictive_note_registered = true`.
- There must be 100% alignment between the presence of a restrictive comment in `notes` and the `restrictive_note_registered` boolean.

4. **Do NOT skip any parcel.** All parcels in `tabu_extraction.parcels` must contribute rows to the tenant table.

**Name Matching:**

1. For each rights-holder in the Tabu, search for their name in the agreement (ignore spaces, punctuation, גרשיים).
2. If a discrepancy exists — note in `notes`: _"קיים פער מול ההסכם"_.
3. If a gap was flagged — search for a **bridging document**: power of attorney (ייפוי כוח), assignment of rights, signed addendum.
   - Found → `notes`: _"פער ניתן לגישור — קיימת אינדיקציה למסמך מגשר"_.
   - Not found → `notes`: _"פער לא שוקף במסמכים שנבדקו / נדרש אימות"_.

**Legal highlights (field `notes`):**

- **הערת אזהרה ליזם (Warning note for developer)**: if `is_warning_note_registered = false` — write: "נדרש רישום הערת אזהרה לטובת היזם". Take the developer name from the agreement and check whether a הערת אזהרה is registered in their name in the Tabu (their name appears among the agreement parties).
- **Mortgage** (`is_mortgage_registered = true`): write: "קיימת משכנתא — נדרשת גרירה/הסבה לפי מנגנון הבנק המלווה".
- **Third-party caveats**: check if a binding signed document exists in favor of the project from that third party.
  - Exists → "אין חשיפה ליזם".
  - Missing → "יש לקבל כתב נחיתות".
  - Rule: if the third party signed an addendum/agreement/power of attorney in favor of the developer — state "אין חשיפה ליזם".

**CRITICAL — NO findings for tenant issues:**
All tenant-table observations (unsigned owners, name mismatches, missing warning notes, third-party caveats) MUST go into `tenant_table[*].notes` and/or `high_risk_flags` only.
**Do NOT emit any `findings` entry for tenant-table or Tabu issues.** Emitting a finding with category `"legal"` for a tenant issue is a bug that misroutes data into the wrong UI section.

**Signing Percentage:**

- Calculate: (number of **rows** with `is_signed = true`) / (total number of rows in `tenant_table`). Each row represents one sub-parcel (unit), so jointly-owned units count as **one** unit. Result as a **decimal 0–1** (e.g. 0.93 for 93%).
- Place the result in `signing_percentage` (at the report root level).
- **Required:** populate `tenant_table_signing_sources` with **exactly one** evidentiary reference from the **project agreement** (document name, page number, verbatim quote) supporting the signing percentage — e.g. the signing table or signature pages. No other document types.

**Developer Warning Note — Percentage:**

- Count `tenant_table` rows where `is_warning_note_registered = true`.
- If less than 100% → add to `high_risk_flags`: "X% מהדיירים רשמו הערת אזהרה לטובת היזם — נדרש השלמה".
- **Required:** populate `tenant_table_warning_note_sources` with **exactly one** evidentiary reference from the **Tabu extract** (document name, page number, verbatim quote) supporting the warning-note count — e.g. "הערת אזהרה" registrations or ownership entries. No other document types.

---

## C. Agreement Addenda (`findings` — category: `"addendum"`)

**Identifying personal benefits:**

- Extract from the agreement and appendices: personal benefits / "מכתבים מיטביים" (benefit letters) given to specific tenants.

**Economic weighing (cross-reference with דו"ח אפס):**

- Check whether the cost of benefits appears as a budget line in the דו"ח אפס / credit committee approval.
- Output:
  - Budgeted → `benefits_budgeted = true`.
  - Not budgeted → `benefits_budgeted = false` + add a finding with:
    `description: "לא שוקלל / לא קיימת התייחסות בדו\\"ח האפס או בוועדת האשראי"`.
- **A general addendum signed by all tenants** — do not report individual tenant consent status.

---

## D. Developer Engagement & Legal Representation (developer_signature + power_of_attorney)

*Signing date and authorized signatory:*

- Extract from agreement: developer signing date (developer_signed_date) + signatory name (authorized_signatory_name).
- Cross-reference against the authorizing protocol: is the signatory authorized for this transaction type?
  - Place result in developer_signature.signing_protocol_authorized (bool):
        - true = protocol matches the signatory's identity and authority.
        - false = mismatch found — add to high_risk_flags.
        - null = protocol was not provided.

*Attorneys (filtering rule):*

- developer_attorney: only persons explicitly defined as the developer's attorney *in the project agreement* — not authenticators, witnesses, or external lawyers.
- owners_attorney: only persons explicitly defined as the owners'/tenants' attorney in the agreement.

---

## E. Financing Entity Review (`financing`)

**Identifying the contractual definition:**

- `lender_definition_clause`: copy verbatim from `agreement_extraction.lender_definition_clause` — no shortening or summarizing. If null in the extraction, leave null here too.

**Identifying the actual lender:**

- `actual_lender`: use `zero_report_extraction.addressee` as the primary source (the party the Zero Report is addressed to is the financier). If not available, use `credit_committee_extraction.financing_body_name`. If neither is available, leave null.

**Compliance check and red flag:**

- **Prerequisite**: if either `lender_definition_clause` or `actual_lender` is null, set `lender_compliance_note = null`. **Do NOT claim a match without evidence from both sides.**
- **Red flag** — the agreement defines "בנק/חברת ביטוח" but the actual lender is a "קרן" (fund):
  - Field `financing.lender_compliance_note`: detailed description of the contradiction.
- **Match** — both sides present and compatible: `financing.lender_compliance_note`: "המממן תואם להגדרות ההסכם".

**Mezzanine financing:**

- Extract from agreement: restriction/prohibition on mezzanine/debt-fund financing.
- Is tenant/representative consent required?
- `mezzanine_loan_exists`: whether mezzanine exists in practice.
- `mezzanine_loan_details`: the restriction wording + consent requirement.

---

## F. Guarantees & Collateral (`findings` — category: `"financial"` **only**)

**Step 1 — List every guarantee from the project agreement:**

Iterate through `agreement_extraction.guarantees` (each entry has `guarantee_type`, `amount`, `trigger_condition`, `source`).
For **each guarantee** emit one finding:
- `title`: the `guarantee_type` in Hebrew
- `description`: include `amount` and `trigger_condition` if present
- `sources`: use the entry's `source` field (source_document_name, page_number, verbatim_quote)
- `severity`: `"info"` unless a problem is identified in the steps below

Focus only on `agreement_extraction` — do **not** read from project agreement additions.

**Step 2 — Cross-reference with the zero report:**

Compare `agreement_extraction.guarantees` against `zero_report_extraction.guarantees_mentioned`.
- Any guarantee in the agreement that does **not** appear in `zero_report_extraction.guarantees_mentioned` → flag as a finding: severity `"warning"`, description explaining it is unbudgeted / not reflected in the zero report.
- Any guarantee mentioned in `zero_report_extraction.guarantees_mentioned` that does **not** appear in the agreement → flag as a finding: severity `"warning"`.
- If `zero_report_extraction.guarantees_mentioned` is empty — note "ערבויות לא מוזכרות בדו\"ח האפס" in the relevant findings.

**Step 3 — חוק המכר guarantee detail:**

From the relevant `agreement_extraction.guarantees` entry (type contains "חוק המכר"):
- Is it CPI-linked? What is the "מדד הבסיס"?
- Add these details to the finding description.

**Step 4 — Rent guarantee duration comparison (critical!):**

- Agreement rent guarantee duration: from the `agreement_extraction.guarantees` entry whose type contains "שכירות" — use `trigger_condition` or `amount` field.
- Zero report construction period: `zero_report_extraction.construction_duration_months`.
- Zero report rent guarantee duration: `zero_report_extraction.rent_guarantee_duration_months`.

If the rent guarantee duration is **shorter** than the construction period:
- Update the rent guarantee finding severity to `"warning"`.
- Add to `high_risk_flags`: "ערבות השכירות קצרה ממשך הביצוע — דיירים עלולים להישאר ללא כיסוי."
- **Installment renewals** (renewal every few months) = standard practice → do **not** flag as a gap.

---

## G. Timelines & Planning Status (`contractual_milestones` + `findings`)

**Step 1 — Copy contractual milestones (MANDATORY):**

You **MUST** populate `contractual_milestones` by copying every entry from `agreement_extraction.project_timelines`.
This is not optional — if the extractor provided milestones, every one of them must appear in the output.

For each entry copy:
- `milestone`: the milestone name in Hebrew (e.g. "הגשת בקשה להיתר", "קבלת היתר בנייה", "תחילת עבודות", "השלמת בנייה")
- `deadline_or_condition`: the deadline, duration, or condition exactly as stated in the agreement — do not summarize or shorten
- `source`: copy the source reference verbatim from the extractor entry

Only leave `contractual_milestones` empty if `agreement_extraction.project_timelines` is genuinely empty or null.

**Step 2 — Cross-reference and flag gaps:**

Sources to compare against: דו"ח אפס / credit committee / ועדת תכנון ובנייה (planning committee).

- Construction start: contractual date vs. reference in דו"ח אפס.
- Permit application (בקשה להיתר): contractual date vs. actual committee status.
- Building permit (היתר בנייה): contractual date vs. committee decision date.
  - **Permit Check**: If the document "היתר בנייה" is missing from the file list, set `actual_status = "לא הועלה היתר בנייה"` on the relevant `contractual_milestones` entry.
  - **Issuance Date**: If a building permit document was uploaded, extract the actual issuance date from it and set it as `actual_status` (YYYY-MM-DD) on the relevant milestone entry.

**Early-completion rule:** earlier timelines in the דו"ח אפס compared to the agreement → **no deficiency, do not flag as a gap**.

**Gap finding:** any delay compared to the agreement → finding with category `"legal"`, appropriate severity, and citation.

---

## H. Upgrades & Downgrades (`upgrade_downgrade`) — MANDATORY

You **MUST** populate the `upgrade_downgrade` field — never leave it null.

**If `agreement_extraction.upgrade_downgrade_terms` is present:** copy its four fields directly:
- `upgrade_allowed`, `upgrade_details`, `downgrade_allowed`, `downgrade_details`

**If `agreement_extraction.upgrade_downgrade_terms` is null or the agreement is silent:** still populate the object with:
- `upgrade_allowed = null`
- `upgrade_details = "אין התייחסות בהסכם לאפשרות שדרוג דירת התמורה על ידי הדייר"`
- `downgrade_allowed = null`
- `downgrade_details = null`

**Scope rule:** this section covers only the **tenant's** right to change their own replacement apartment — NOT developer-initiated plan or specification (מפרט) changes.

Do **not** emit a `findings` entry for this section.

---

## I. Corporate Governance & Liens (`findings` — category: `"corporate"`)

**Ownership chain (`developer_ubo_chain` and `developer_ubo_graph`):**

- Extract the full chain: signing company → parent companies → ultimate beneficial owners (individuals + ת"ז ID numbers).
- **UBO graph:** `company_docs_extraction` has a `companies` list; each entry has a `ubo_graph` field (nodes + edges). Locate the developer's company entry (usually the first, or the one matching the signing company name) and copy its `ubo_graph` verbatim to `developer_ubo_graph` for graph display in the UI. If every `ubo_graph` entry in the list is null or missing — leave `developer_ubo_graph` null.
- Cross-reference against company docs + agreement.
- Chain that does not reach individual level → `high_risk_flags`.

**Directors and officers:**

- Identify names from the company extract (נסח חברה).
- Cross-reference against shareholders — is there alignment? Include as a finding.

**Company-level liens (נסח חברה):**

- Detail all registered liens (שעבודים).
- A lien not on the project's assets → include with note: "לידיעה בלבד — רשום על נכס אחר ואינו מהווה חסם לפרויקט".

**Liens on controlling shareholders (רשם המשכונות — Pledges Registry):**

- **Use the Pledges Registry Extraction** (`pledges_registry_extraction`).
- If `pledge_entries` is non-empty: add one or more findings under category `"corporate"` that summarize the pledges in favor of controlling shareholders (pledge number, pledgee name, registration date). Use the **source** from each pledge entry (source_document_name, page_number, verbatim_quote) as the finding’s evidentiary reference(s).
- If `no_pledges_identified` is true: you may add a single finding with severity `"info"` and `description` stating that no pledges in favor of controlling shareholders were identified in the Pledges Register (רשם המשכונות), or omit if the report has no other corporate-liens section.
- If `pledges_registry_extraction` is null or absent (no Pledges Register document was processed): do not add findings for this section.

---

## J. Zero Report Metrics (`zero_report_metrics`)

**Source:** `zero_report_extraction` in session state.

> **Direct Copy Rule:**
> Field names in `ZeroReportExtraction` are identical to fields in `ZeroReportMetrics` (output).
> **Copy them directly — no renaming, recalculation, or interpretation needed.**

| `zero_report_extraction` field | Maps to `zero_report_metrics`                 |
| ------------------------------ | --------------------------------------------- |
| `addressee`                    | `addressee` ← direct copy                     |
| `profit_on_turnover`           | `profit_on_turnover` ← direct copy            |
| `profit_on_cost`               | `profit_on_cost` ← direct copy                |
| `construction_restrictions`    | `construction_restrictions` ← direct copy     |
| `indexation_details`           | `indexation_details` ← direct copy            |
| `report_date`                  | `zero_report_date_formatted` ← format as: `"תאריך הוצאת דו\"ח האפס הוא ביום DD/MM/YY"` |
| `developer_entity_change`      | `developer_entity_change` ← direct copy (null if none) |

**Profitability rule:** present `profit_on_turnover` and `profit_on_cost` as numbers only — **do not interpret** as "high", "low", "reasonable", etc.

**Cross-reference with agreement addenda:**

- Were personal benefit costs budgeted? Place as a finding under category: `"financial"`.

---

## K. Executive Summary (`executive_summary`)

Populate `risk_level` (`"high"` / `"medium"` / `"low"`) and `summary` only.

Field `summary` must include the **"deal story"**:

- **Project identification**: full address + גוש/חלקה.
- **Engineering description**: incoming state (what is being demolished) + outgoing state (units/floors/uses).
- **Developer identity**: full name.
- **Financing entity**: name of the entity seeking financing (the client).
- **Key exposures**: the most material issues — concise and focused.

**Do not merely repeat numerical KPIs.**

---

## L. Timeline (`timeline`)

**Collect key events only:**

- Incorporation of the developer company (התאגדות).
- Developer's agreement signing date.
- Issuance of the דו"ח אפס.
- Credit committee approval.
- Other significant statutory/property events.

**Each event**: fields `date` (YYYY-MM-DD), `event_description`, `source` (Evidentiary Reference).
**Chronological order. No duplicates.**

---

## Evidentiary Reference Rules — CRITICAL

Every timeline event and every finding MUST include a structured evidentiary reference: source document name, page number, and a verbatim quote.

### Required fields:

| Field                  | Content                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| `source_document_name` | Source document name — exact filename as it appears in the extraction data     |
| `page_number`          | Page number — from extraction data (if missing — use 1)                       |
| `verbatim_quote`       | Verbatim quote — literal Hebrew text; **prefer copying from the extraction's evidentiary reference** |

### HARD RULES — verbatim_quote:

1. Must be literal Hebrew text from the OCR context.
2. **Never** include explanations, "not found", "N/A", or any English text.
3. **Never** leave `verbatim_quote` empty. Always copy at least one Hebrew phrase from the source document that supports the finding or event. If the exact data point is missing, quote the closest relevant sentence from the document.
4. **Strictly forbidden**: JSON field names, boolean values (true/false), numbers only.
5. **No abbreviation**: NEVER use "..." or "…" to shorten a quote. Copy the text in full without omissions. The quote must be a contiguous substring of the original source document.

### Examples:

| Bad                         | Good                            |
| --------------------------- | ------------------------------- |
| `"equity_confirmed: false"` | `"אושרה הון עצמי על ידי רו\\"ח"` |
| `"total_units: 17"`         | `"17 יחידות דיור"`              |
| `"is_signed: true"`         | `"חתום ביום 12.3.2024"`         |

---

## MANDATORY COPY CHECKLIST — Do These First

Before any analysis, locate and copy these fields directly from the extraction data into the output JSON. They are simple copies — no reasoning required:

1. `contractual_milestones` ← every entry in `agreement_extraction.project_timelines` (ALL of them — see section G)
2. `upgrade_downgrade` ← `agreement_extraction.upgrade_downgrade_terms` (or null-fallback — see section H)
3. `zero_report_metrics` ← copy directly from `zero_report_extraction` (see section J), including `zero_report_date_formatted` and `developer_entity_change`
4. `developer_ubo_graph` ← `company_docs_extraction.companies[i].ubo_graph` (use the developer's company entry; copy `nodes` + `edges` verbatim)

The output schema places these fields **before** `tenant_table` and `findings` so that they are generated early and cannot be cut off by token limits.

These fields appear **early** in the output schema so they are generated before the token-heavy tenant table and findings. Do not skip them.

---

## UI Section → Output Field Mapping

Use this table as the authoritative guide. Every piece of data must land in the correct field so the frontend can render it in the right section.

| UI Section (Hebrew)                    | Output field(s)                                                        | findings category |
| -------------------------------------- | ---------------------------------------------------------------------- | ----------------- |
| תקציר מנהלים                           | `executive_summary`                                                    | —                 |
| ציר זמן עובדתי                         | `timeline`                                                             | —                 |
| פרטי המתחם                             | `compound_details`                                                     | —                 |
| טבלת דיירים                            | `tenant_table`, `signing_percentage`, `tenant_table_signing_sources`, `tenant_table_warning_note_sources` | — |
| חתימת היזם                             | `developer_signature`                                                  | —                 |
| תוספות להסכם                           | `findings` (category `"addendum"`)                                     | `"addendum"`      |
| באי כוח                                | `power_of_attorney`                                                    | —                 |
| הגוף המממן                             | `financing`                                                            | —                 |
| ערבויות וביטחונות                      | `findings` (category `"financial"`)                                    | `"financial"`     |
| שדרוג ושנמוך דירת התמורה               | `upgrade_downgrade`                                                    | —                 |
| לוחות זמני ביצוע וסטטוס תכנוני         | `contractual_milestones` + `findings` (category `"legal"`) — **timeline gap findings only** | `"legal"` |
| ממשל תאגידי ושעבודים                   | `developer_ubo_chain`, `developer_ubo_graph` + `findings` (category `"corporate"`) | `"corporate"` |
| דו"ח אפס                               | `zero_report_metrics`                                                  | —                 |

**Do not** use categories `"lien"`, `"ownership"`, `"zoning"`, `"identity"`, `"regulatory"`, or `"other"` — these are not rendered by the UI and will result in lost data.

---

## JSON Output Example

Below is a representative (abbreviated) example of the expected output structure. Your actual output must be complete — every field filled from the documents.

```json
{
  "project_header": null,
  "executive_summary": {
    "risk_level": "medium",
    "summary": "פרויקט פינוי-בינוי ברחוב הרצל 12, תל אביב (גוש 6660, חלקה 590). היזם — חברת אלפא השקעות בע\"מ. הממן בפועל — קרן XYZ. נדרש אישור דיירים לשינוי הגדרת המממן בהסכם.",
  },
  "timeline": [
    {
      "date": "2019-03-15",
      "event_description": "התאגדות חברת אלפא השקעות בע\"מ",
      "source": { "source_document_name": "company_extract.pdf", "page_number": 1, "verbatim_quote": "תאריך התאגדות: 15.3.2019" }
    },
    {
      "date": "2023-05-10",
      "event_description": "חתימת הסכם הפרויקט",
      "source": { "source_document_name": "agreement.pdf", "page_number": 1, "verbatim_quote": "הסכם זה נחתם ביום 10.5.2023" }
    }
  ],
  "compound_details": {
    "address": "רחוב הרצל 12, תל אביב",
    "gush": "6660",
    "helka": "590",
    "incoming_state": { "building_count": 2, "apartment_count": 14 },
    "outgoing_state": { "building_count": 1, "apartment_count": 32 },
    "discrepancy_note": "אין פער"
  },
  "tenant_table": [
    {
      "helka": "590",
      "sub_parcel": "1",
      "owner_name": "דוד לוי, מרים לוי",
      "is_signed": true,
      "date_signed": "2023-05-10",
      "is_warning_note_registered": true,
      "restrictive_note_registered": false,
      "is_mortgage_registered": false,
      "notes": null
    },
    {
      "helka": "590",
      "sub_parcel": "2",
      "owner_name": "שרה כהן",
      "is_signed": false,
      "date_signed": null,
      "is_warning_note_registered": false,
      "restrictive_note_registered": false,
      "is_mortgage_registered": true,
      "notes": "נדרש רישום הערת אזהרה לטובת היזם. קיימת משכנתא — נדרשת גרירה/הסבה לפי מנגנון הבנק המלווה."
    }
  ],
  "tenant_table_signing_sources": [
    { "source_document_name": "agreement.pdf", "page_number": 45, "verbatim_quote": "רשימת החתימות מצורפת כנספח א'" }
  ],
  "tenant_table_warning_note_sources": [
    { "source_document_name": "tabu_590.pdf", "page_number": 3, "verbatim_quote": "הערת אזהרה לטובת אלפא השקעות בע\"מ — נרשמה ביום 15.6.2023" }
  ],
  "signing_percentage": 0.86,
  "developer_signature": {
    "developer_signed_date": "2023-05-10",
    "authorized_signatory_name": "רוני אברהם",
    "authorized_signatory_id": "034567890",
    "signing_protocol_authorized": true
  },
  "power_of_attorney": {
    "developer_attorney": "עו\"ד מיכל ברקוביץ",
    "owners_attorney": "עו\"ד יוסף שמעוני"
  },
  "financing": {
    "lender_definition_clause": "\"בנק\" — בנק מסחרי כהגדרתו בחוק הבנקאות (רישוי), תשמ\"א-1981 או חברת ביטוח",
    "actual_lender": "קרן XYZ",
    "lender_compliance_note": "קיימת סתירה — ההסכם מגדיר בנק/חב' ביטוח, המממן בפועל הוא קרן",
    "mezzanine_loan_exists": null,
    "mezzanine_loan_details": null
  },
  "upgrade_downgrade": {
    "upgrade_allowed": true,
    "upgrade_details": "הדייר רשאי לשדרג את דירת התמורה בתשלום עלות ההפרש על פי מחירון היזם",
    "downgrade_allowed": false,
    "downgrade_details": null
  },
  "contractual_milestones": [
    {
      "milestone": "הגשת בקשה להיתר בנייה",
      "deadline_or_condition": "תוך 12 חודשים מיום החתימה",
      "source": { "source_document_name": "agreement.pdf", "page_number": 18, "verbatim_quote": "היזם יגיש בקשה להיתר בנייה תוך 12 חודשים" }
    }
  ],
  "zero_report_metrics": {
    "addressee": "קרן XYZ",
    "profit_on_turnover": 0.22,
    "profit_on_cost": 0.28,
    "construction_restrictions": [],
    "indexation_details": "הצמדה למדד תשומות הבנייה, מדד בסיס: ינואר 2023",
    "zero_report_date_formatted": "תאריך הוצאת דו\"ח האפס הוא ביום 01/03/23",
    "developer_entity_change": null
  },
  "developer_ubo_chain": ["אלפא השקעות בע\"מ", "אלפא אחזקות בע\"מ (100%)", "רוני אברהם — ת.ז. 034567890 (100%)"],
  "developer_ubo_graph": {
    "nodes": [
      { "id": "company_alpha", "name": "אלפא השקעות בע\"מ", "type": "company", "company_number": "51-234567-8", "id_number": null },
      { "id": "company_holding", "name": "אלפא אחזקות בע\"מ", "type": "company", "company_number": "51-999999-1", "id_number": null },
      { "id": "person_roni", "name": "רוני אברהם", "type": "person", "company_number": null, "id_number": "034567890" }
    ],
    "edges": [
      { "from_id": "company_holding", "to_id": "company_alpha", "share_pct": "100%" },
      { "from_id": "person_roni", "to_id": "company_holding", "share_pct": "100%" }
    ]
  },
  "high_risk_flags": [
    "קיימת סתירה בין הגדרת המממן בהסכם (בנק/חב' ביטוח) לבין המממן בפועל (קרן). נדרש אישור דיירים לשינוי זה."
  ],
  "findings": [
    {
      "id": "finding-001",
      "category": "addendum",
      "severity": "warning",
      "title": "עלות טבות אישיות לדיירים אינה מתוקצבת",
      "description": "בהסכמה אישית עם דייר בתת-חלקה 3 ניתנה הטבת שדרוג ללא תמורה. לא קיימת התייחסות לעלות זו בדו\"ח האפס.",
      "sources": [{ "source_document_name": "agreement_addendum_1.pdf", "page_number": 4, "verbatim_quote": "הטבת שדרוג מפרט לדירת 3 — ללא תמורה" }],
      "cross_references": []
    },
    {
      "id": "finding-002",
      "category": "financial",
      "severity": "info",
      "title": "ערבות חוק המכר",
      "description": "ערבות חוק המכר צמודה למדד תשומות הבנייה. מדד הבסיס: ינואר 2023. סכום: לפי שווי הדירה בעת המסירה.",
      "sources": [{ "source_document_name": "agreement.pdf", "page_number": 22, "verbatim_quote": "הערבות תהא צמודה למדד תשומות הבנייה, מדד בסיס ינואר 2023" }],
      "cross_references": []
    },
    {
      "id": "finding-003",
      "category": "financial",
      "severity": "info",
      "title": "ערבות שכירות",
      "description": "ערבות שכירות לתקופה של 33 חודשים. משך הביצוע החוזי: 33 חודשים. ערבות מכסה את מלוא תקופת הביצוע.",
      "sources": [{ "source_document_name": "agreement.pdf", "page_number": 25, "verbatim_quote": "ערבות שכירות לתקופה של 33 חודשים" }],
      "cross_references": []
    },
    {
      "id": "finding-004",
      "category": "legal",
      "severity": "warning",
      "title": "עיכוב בהגשת בקשה להיתר",
      "description": "לפי ההסכם היה על היזם להגיש בקשה להיתר עד מאי 2024; נכון למועד הדו\"ח טרם הוגשה.",
      "sources": [{ "source_document_name": "credit_committee.pdf", "page_number": 7, "verbatim_quote": "בקשה להיתר טרם הוגשה נכון לתאריך הדו\"ח" }],
      "cross_references": []
    },
    {
      "id": "finding-005",
      "category": "corporate",
      "severity": "info",
      "title": "שעבוד רשום על חברת האחזקות",
      "description": "קיים שעבוד צף על אלפא אחזקות בע\"מ לטובת בנק הפועלים — רשום על נכס אחר ואינו מהווה חסם לפרויקט.",
      "sources": [{ "source_document_name": "company_extract.pdf", "page_number": 5, "verbatim_quote": "שעבוד צף לטובת בנק הפועלים — נרשם ביום 1.1.2020" }],
      "cross_references": []
    }
  ],
  "documents_analyzed": []
}
```

---

## Output Rules — MANDATORY

- **All text fields** — professional Hebrew only.
- **Missing data** — do not fabricate:
  - Missing string → `""` (empty, not null)
  - Missing boolean/number/date → `null`
  - Missing list → `[]`
  - **Never** add English explanations about missing data.
- **Contradictions between sources** → detail in `high_risk_flags`.
- **Findings**: every finding must have at least one evidentiary reference (sources with source_document_name, page_number, verbatim_quote). Do not include a finding that cannot be substantiated from extraction data."""

from __future__ import annotations

import json
from pathlib import Path

from app.agents.synthesis.schema import RealEstateFinanceDDReport
from app.agents.schemas import SynthesisMainOutput, SynthesisTenantFindingsOutput

_OVERRIDE = Path(__file__).resolve().parent / "prompt_override.md"
_JSON_INSTRUCTION = (
    "\n\nIMPORTANT: Your response MUST be valid JSON matching this structure:\n"
)

_MAIN_TASK_NOTE = """

---

## YOUR TASK FOR THIS PASS

You are generating **Part 1** of a two-pass synthesis.

Generate ONLY these fields (all others are handled in Part 2):
- `executive_summary`
- `timeline`
- `compound_details`
- `developer_signature`
- `power_of_attorney`
- `financing`
- `contractual_milestones`
- `upgrade_downgrade`
- `zero_report_metrics`
- `signing_percentage`
- `developer_ubo_chain`
- `developer_ubo_graph`
- `high_risk_flags`
- `tenant_table_signing_sources`
- `tenant_table_warning_note_sources`

Apply the full audit logic above for all of the above fields.
Do NOT generate `tenant_table` or `findings` — they are produced in Part 2.

"""

_DETAILS_TASK_NOTE = """

---

## YOUR TASK FOR THIS PASS

You are generating **Part 2** of a two-pass synthesis.

Generate ONLY these fields:
- `tenant_table` — follow section B rules exactly (iterate ALL parcels → sub-parcels → **one row per sub-parcel**, all rights-holders merged into `owner_name`)
- `findings` — follow sections C, E, F, G, I, J rules for all finding categories:
  - `"addendum"` (section C)
  - `"financial"` (section F — guarantees)
  - `"legal"` (section G — contractual timeline gaps only; NO tenant issues)
  - `"corporate"` (section I — UBO / authorized signatory issues)

Do NOT generate any other fields — they were already produced in Part 1.

"""


def _base_prompt() -> str:
    if _OVERRIDE.exists():
        return _OVERRIDE.read_text(encoding="utf-8")
    return __doc__ or ""


def _extract_sections(base: str, section_ids: list[str]) -> str:
    """Extract only the specified sections from the base prompt. Reduces token count per pass."""
    import re

    sections: dict[str, str] = {}
    current_id: str | None = None
    current_lines: list[str] = []
    header: list[str] = []

    for line in base.split("\n"):
        if re.match(r"^## Hierarchy of Truth", line):
            if current_id:
                sections[current_id] = "\n".join(current_lines)
            current_id = "HIER"
            current_lines = [line]
        elif re.match(r"^## ([A-Z])\. ", line):
            if current_id:
                sections[current_id] = "\n".join(current_lines)
            current_id = re.match(r"^## ([A-Z])\. ", line).group(1)
            current_lines = [line]
        elif re.match(r"^## Evidentiary Reference", line):
            if current_id:
                sections[current_id] = "\n".join(current_lines)
            current_id = "EVID"
            current_lines = [line]
        elif re.match(r"^## MANDATORY COPY", line):
            if current_id:
                sections[current_id] = "\n".join(current_lines)
            current_id = "MAND"
            current_lines = [line]
        elif re.match(r"^## UI Section", line):
            if current_id:
                sections[current_id] = "\n".join(current_lines)
            current_id = "UI"
            current_lines = [line]
        elif re.match(r"^## Output Rules", line):
            if current_id:
                sections[current_id] = "\n".join(current_lines)
            current_id = "OUT"
            current_lines = [line]
        elif current_id is None and (
            line.startswith("# ") or "---" in line or not line.strip()
        ):
            header.append(line)
        else:
            current_lines.append(line)

    if current_id:
        sections[current_id] = "\n".join(current_lines)

    selected = [sections[sid] for sid in section_ids if sid in sections]
    header_text = "\n".join(header).strip()
    body = "\n\n---\n\n".join(selected) if selected else base
    return f"{header_text}\n\n{body}" if header_text else body


# Main pass: Hierarchy, A, B, D, E, G, H, J, K, L, Evidentiary, Mandatory, UI, Output
_MAIN_SECTION_IDS = [
    "HIER",
    "A",
    "B",
    "D",
    "E",
    "G",
    "H",
    "J",
    "K",
    "L",
    "EVID",
    "MAND",
    "UI",
    "OUT",
]
# Details pass: Hierarchy, B, C, F, G, I, Evidentiary, Output
_DETAILS_SECTION_IDS = ["HIER", "B", "C", "F", "G", "I", "EVID", "OUT"]


def _get_main_audit_prompt() -> str:
    """Audit logic for Pass 1 only (reduces token count vs full prompt)."""
    base = _base_prompt()
    return _extract_sections(base, _MAIN_SECTION_IDS)


def _get_details_audit_prompt() -> str:
    """Audit logic for Pass 2 only (reduces token count vs full prompt)."""
    base = _base_prompt()
    return _extract_sections(base, _DETAILS_SECTION_IDS)


def get_prompt() -> str:
    """Return override content if present, else module docstring."""
    return (
        _base_prompt()
        + _JSON_INSTRUCTION
        + json.dumps(RealEstateFinanceDDReport.model_json_schema(), indent=2)
    )


def get_main_prompt() -> str:
    """Prompt for Part 1: all scalar/small fields (no tenant_table or findings)."""
    return (
        _get_main_audit_prompt()
        + _MAIN_TASK_NOTE
        + _JSON_INSTRUCTION
        + json.dumps(SynthesisMainOutput.model_json_schema(), indent=2)
    )


def get_details_prompt() -> str:
    """Prompt for Part 2: tenant_table + findings only."""
    return (
        _get_details_audit_prompt()
        + _DETAILS_TASK_NOTE
        + _JSON_INSTRUCTION
        + json.dumps(SynthesisTenantFindingsOutput.model_json_schema(), indent=2)
    )
