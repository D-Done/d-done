"""AI-powered checklist generator for Real Estate Finance DD reports.

Analyses the final report JSON and produces a structured list of action items
(missing documents, warning-note registrations, mortgage releases, etc.) that
the project team needs to complete before the deal can close.

Only runs for RealEstateFinanceDDReport (מימון נדל״ן).  Other report types
return an empty list.
"""

from __future__ import annotations

import json
import logging
import os

from app.agents.schemas import RealEstateFinanceDDReport

logger = logging.getLogger(__name__)

# Category constants
CAT_MISSING_DOC = "missing_doc"
CAT_WARNING_NOTE = "warning_note"
CAT_MORTGAGE = "mortgage"
CAT_LENDER = "lender"
CAT_SIGNING = "signing"
CAT_CORPORATE = "corporate"
CAT_OTHER = "other"

CATEGORY_LABELS = {
    CAT_MISSING_DOC: "מסמכים חסרים",
    CAT_WARNING_NOTE: "הערות אזהרה",
    CAT_MORTGAGE: "משכנתאות",
    CAT_LENDER: "גוף המממן",
    CAT_SIGNING: "חתימות חסרות",
    CAT_CORPORATE: "תאגידי",
    CAT_OTHER: "אחר",
}

GEMINI_MODEL = "gemini-2.5-flash"

_SYSTEM_PROMPT = """\
You are an expert Israeli real estate finance (מימון נדל"ן) attorney and analyst.
You receive a completed DD report JSON and generate a completeness checklist —
a list of action items the project team must complete before the deal closes.

## PRIORITY FOCUS — Credit Committee (ועדת אשראי) cross-reference
This is the most important analysis step. Read every finding, high_risk_flag,
and the financing/lender sections and identify:
a) Documents or agreements that the credit committee REFERENCED or REQUIRED but are
   NOT present in the uploaded files (e.g., "הסכם X צורף כנספח לועדת האשראי" but
   the file was never uploaded, or "יש לצרף אישור Y" mentioned in the credit decision).
b) Addendums, side letters, or supplementary agreements (תוספות להסכם, מכתבי כוונות,
   הסכמי גרירה) mentioned anywhere in the report but not uploaded.
c) Beneficial documents (מסמכים מיטיבים) — letters granting additional rights or
   exemptions that are referenced but missing.
d) Rights-transfer agreements (הסכמי העברת זכויות) — if the report mentions a change
   of developer / rights transfer between entities (e.g., company A transferred rights
   to company B), the actual transfer agreement must be uploaded.
e) Any gap between what the credit committee approved and what was actually provided.

## Additional focus areas
1. Documents referenced anywhere in the report that were mentioned but not uploaded.
2. Warning notes (הערות אזהרה) that need to be registered in Tabu for the developer.
3. Third-party interests (warning notes, liens) that need to be removed.
4. Mortgages registered on parcels that must be released.
5. Tenants who have not yet signed the agreement.
6. Lender compliance issues (actual lender ≠ lender in agreement).
7. Missing corporate documents — company extract (נסח חברה), incorporation certificate.
8. Planning permits, zoning decisions, or committee approvals mentioned but not uploaded.
9. Any other actionable gap surfaced in findings or high_risk_flags.

## Output format
Respond with a JSON object: {"items": [...]}
Each item:
  - category: "missing_doc" | "warning_note" | "mortgage" | "lender" | "signing" | "corporate" | "other"
  - title: short Hebrew action title (max 120 chars), be specific — name the document/party
  - description: detailed Hebrew explanation referencing where it was mentioned (max 400 chars)
  - priority: "high" | "medium" | "low"

Rules:
- Be specific — name the exact document, tenant, parcel, or counterparty.
- Do NOT include items already completed/resolved.
- Do NOT repeat the same item twice.
- Return between 3 and 40 items.
- Output ONLY valid JSON, no markdown fences.
"""


def _ensure_genai_env() -> None:
    from app.core.config import settings

    use_vertex = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").strip().lower() in {
        "1", "true", "yes",
    }
    if use_vertex or (not settings.gemini_api_key and settings.gcp_project_id):
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"
        if settings.gcp_project_id and not os.environ.get("GOOGLE_CLOUD_PROJECT"):
            os.environ["GOOGLE_CLOUD_PROJECT"] = settings.gcp_project_id
        if settings.vertex_ai_location and not os.environ.get("GOOGLE_CLOUD_LOCATION"):
            os.environ["GOOGLE_CLOUD_LOCATION"] = settings.vertex_ai_location


def generate_checklist_items(report: RealEstateFinanceDDReport) -> list[dict]:
    """Generate checklist items for a RealEstateFinanceDDReport.

    Returns a list of dicts with keys: category, title, description, priority, sort_order.
    Calls Gemini with the full report JSON to generate comprehensive action items.
    """
    # Produce a pruned report dict (drop empty/null fields to reduce token usage)
    report_dict = report.model_dump(mode="json", exclude_none=True)

    # Limit size to avoid context overflows
    report_json = json.dumps(report_dict, ensure_ascii=False)
    if len(report_json) > 80_000:
        report_json = report_json[:80_000] + "\n... [truncated]"

    try:
        items = _call_gemini(report_json)
    except Exception as exc:
        logger.error("Checklist generation via Gemini failed: %s", exc, exc_info=True)
        items = []

    # Augment with guaranteed rule-based items that Gemini might miss
    rule_items = _rule_based_items(report)
    items = _merge_items(rule_items, items)

    # Assign sort_order: by priority then category
    priority_order = {"high": 0, "medium": 1, "low": 2}
    category_order = {
        CAT_SIGNING: 0,
        CAT_WARNING_NOTE: 1,
        CAT_MORTGAGE: 2,
        CAT_MISSING_DOC: 3,
        CAT_LENDER: 4,
        CAT_CORPORATE: 5,
        CAT_OTHER: 6,
    }
    items.sort(
        key=lambda x: (
            priority_order.get(x.get("priority", "low"), 2),
            category_order.get(x.get("category", "other"), 6),
        )
    )
    for i, item in enumerate(items):
        item["sort_order"] = i

    return items


def _call_gemini(report_json: str) -> list[dict]:
    import json as _json
    from google import genai
    from google.genai import types

    _ensure_genai_env()

    client = genai.Client(http_options=types.HttpOptions(api_version="v1"))
    config = types.GenerateContentConfig(
        system_instruction=_SYSTEM_PROMPT,
        temperature=0.2,
        response_mime_type="application/json",
        max_output_tokens=4096,
    )
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[types.Content(
            role="user",
            parts=[types.Part.from_text(text=f"Report JSON:\n{report_json}")],
        )],
        config=config,
    )
    raw = (response.text or "").strip()
    data = _json.loads(raw)
    if isinstance(data, dict):
        data = data.get("items", [])
    return [i for i in data if isinstance(i, dict) and "title" in i and "category" in i]


def _rule_based_items(report: RealEstateFinanceDDReport) -> list[dict]:
    """Generate guaranteed items from structured fields in the report."""
    items: list[dict] = []

    tenant_table = report.tenant_table or []
    for row in tenant_table:
        name = row.owner_name or "—"
        parcel = row.sub_parcel or row.helka or "—"

        # Unsigned tenant
        if row.is_signed is False:
            items.append({
                "category": CAT_SIGNING,
                "title": f"קבלת חתימה — {name} (תת-חלקה {parcel})",
                "description": f"בעל הדירה {name} טרם חתם על הסכם הפינוי-בינוי.",
                "priority": "high",
            })

        # Warning note not registered
        if row.is_warning_note_registered is False:
            items.append({
                "category": CAT_WARNING_NOTE,
                "title": f"רישום הערת אזהרה ליזם — {name} (תת-חלקה {parcel})",
                "description": (
                    f"הערת אזהרה לטובת היזם טרם נרשמה בטאבו עבור {name}, תת-חלקה {parcel}."
                ),
                "priority": "high",
            })

        # Mortgage registered — needs release
        if row.is_mortgage_registered is True:
            items.append({
                "category": CAT_MORTGAGE,
                "title": f"מחיקת משכנתא — {name} (תת-חלקה {parcel})",
                "description": (
                    f"משכנתא רשומה על תת-חלקה {parcel} של {name}. יש לטפל במחיקה לפני סגירת העסקה."
                ),
                "priority": "high",
            })

        # Restrictive note for third party
        if row.restrictive_note_registered is True:
            items.append({
                "category": CAT_WARNING_NOTE,
                "title": f"הסרת הערה מגבילה — {name} (תת-חלקה {parcel})",
                "description": (
                    f"קיימת הערה מגבילה בנסח הטאבו לגבי תת-חלקה {parcel}. יש לבחון ולהסיר."
                ),
                "priority": "medium",
            })

    # Lender non-compliance
    fin = report.financing
    if fin and fin.lender_compliance_note:
        note_lower = fin.lender_compliance_note.lower()
        if any(kw in note_lower for kw in ["לא תואם", "non-compliant", "נדרש", "אישור הדיירים"]):
            items.append({
                "category": CAT_LENDER,
                "title": "הסדרת זהות הגוף המממן מול הדיירים",
                "description": fin.lender_compliance_note[:300],
                "priority": "high",
            })

    # Missing corporate chain
    if not report.developer_ubo_chain:
        items.append({
            "category": CAT_CORPORATE,
            "title": "צירוף נסח חברה ושרשרת בעלות (UBO)",
            "description": "לא צורפו מסמכי חברה המאמתים את שרשרת הבעלות של היזם.",
            "priority": "medium",
        })

    # Rights transfer agreement — when developer changed hands
    zr = report.zero_report_metrics
    if zr and zr.developer_entity_change:
        ec = zr.developer_entity_change
        orig = ec.original_developer or "הגורם המקורי"
        curr = ec.current_developer or "הגורם הנוכחי"
        items.append({
            "category": CAT_MISSING_DOC,
            "title": f"הסכם העברת זכויות — {orig} ל-{curr}",
            "description": (
                f"הדוח מזהה שינוי יזם מ-{orig} ל-{curr}. "
                f"יש להמציא הסכם העברת זכויות חתום המאשר את המעבר. "
                + (ec.change_details or "")
            )[:400],
            "priority": "high",
        })

    return items


def _merge_items(rule_items: list[dict], ai_items: list[dict]) -> list[dict]:
    """Merge rule-based and AI items, removing near-duplicates."""
    seen_titles: set[str] = set()
    result: list[dict] = []

    def _add(item: dict) -> None:
        title = item.get("title", "").strip()
        key = title[:60].lower()
        if key in seen_titles:
            return
        seen_titles.add(key)
        result.append(item)

    for item in rule_items:
        _add(item)
    for item in ai_items:
        _add(item)

    return result
