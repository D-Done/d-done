"""PDF export — WeasyPrint-based, styled to match the D-Done report viewer.

Renders an HTML template to PDF so the output looks identical to the
web UI (cards, colored risk badges, RTL Hebrew, per-section layout).
"""

from __future__ import annotations

import io
from datetime import date
from pathlib import Path
from typing import Any

from jinja2 import Environment, BaseLoader
from app.agents.schemas import DDReport, RealEstateFinanceDDReport, Finding

_FONTS_DIR = Path(__file__).parent.parent.parent / "assets" / "fonts"
_FONT_PATH = _FONTS_DIR / "NotoSansHebrew.ttf"

RISK_LABEL = {"high": "גבוה", "medium": "בינוני", "low": "נמוך"}
RISK_CLASS = {"high": "risk-high", "medium": "risk-medium", "low": "risk-low"}
SEV_LABEL = {"critical": "קריטי", "warning": "אזהרה", "info": "מידע"}
SEV_CLASS = {"critical": "sev-critical", "warning": "sev-warning", "info": "sev-info"}
BOOL_HE: dict[Any, str] = {True: "✓ כן", False: "✗ לא", None: "—"}


_CSS = """
@font-face {{
    font-family: 'NotoHebrew';
    src: url('{font_path}');
    font-weight: normal;
}}
@font-face {{
    font-family: 'NotoHebrew';
    src: url('{font_path}');
    font-weight: bold;
}}

* {{ box-sizing: border-box; margin: 0; padding: 0; }}

@page {{
    size: A4;
    margin: 18mm 20mm 22mm 20mm;
    @top-left {{
        content: "D-DONE";
        font-family: 'NotoHebrew', sans-serif;
        font-size: 8pt;
        color: #94a3b8;
        font-weight: bold;
        letter-spacing: 1px;
    }}
    @top-right {{
        content: string(project-title);
        font-family: 'NotoHebrew', sans-serif;
        font-size: 8pt;
        color: #94a3b8;
        direction: rtl;
    }}
    @bottom-center {{
        content: counter(page) " / " counter(pages);
        font-family: 'NotoHebrew', sans-serif;
        font-size: 8pt;
        color: #94a3b8;
    }}
}}

body {{
    font-family: 'NotoHebrew', sans-serif;
    direction: rtl;
    color: #1e293b;
    font-size: 10pt;
    line-height: 1.6;
    background: white;
}}

/* ── Cover page ── */
.cover {{
    page-break-after: always;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 240mm;
    text-align: center;
    padding: 20mm;
}}
.cover-logo {{
    font-size: 18pt;
    font-weight: bold;
    color: #1e40af;
    letter-spacing: 2px;
    margin-bottom: 8mm;
}}
.cover-title {{
    font-size: 22pt;
    font-weight: bold;
    color: #0f172a;
    margin-bottom: 4mm;
    string-set: project-title content();
}}
.cover-subtitle {{
    font-size: 12pt;
    color: #64748b;
    margin-bottom: 8mm;
}}
.cover-meta {{
    font-size: 10pt;
    color: #94a3b8;
    margin-top: 2mm;
}}

/* ── Risk badge on cover ── */
.cover-risk {{
    display: inline-block;
    padding: 6px 20px;
    border-radius: 999px;
    font-size: 13pt;
    font-weight: bold;
    margin: 6mm 0;
}}

/* ── Section card ── */
.section {{
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    margin-bottom: 10mm;
    page-break-inside: avoid;
    overflow: hidden;
}}
.section-header {{
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    padding: 8px 14px;
    display: flex;
    align-items: center;
    gap: 8px;
}}
.section-num {{
    background: #1e40af;
    color: white;
    font-size: 8pt;
    font-weight: bold;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}}
.section-title {{
    font-size: 13pt;
    font-weight: bold;
    color: #1e293b;
}}
.section-body {{
    padding: 12px 14px;
}}

/* ── Key-value rows ── */
.kv-table {{
    width: 100%;
    border-collapse: collapse;
}}
.kv-table tr td:first-child {{
    font-weight: bold;
    color: #475569;
    width: 38%;
    padding: 4px 8px 4px 0;
    vertical-align: top;
}}
.kv-table tr td:last-child {{
    padding: 4px 0 4px 8px;
    color: #0f172a;
}}
.kv-table tr {{
    border-bottom: 1px solid #f1f5f9;
}}
.kv-table tr:last-child {{
    border-bottom: none;
}}

/* ── Data tables ── */
.data-table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 8.5pt;
}}
.data-table th {{
    background: #f1f5f9;
    color: #475569;
    font-weight: bold;
    padding: 7px 8px;
    text-align: right;
    border: 1px solid #e2e8f0;
}}
.data-table td {{
    padding: 6px 8px;
    border: 1px solid #e2e8f0;
    vertical-align: top;
    color: #1e293b;
}}
.data-table tr:nth-child(even) td {{
    background: #f8fafc;
}}

/* ── Risk / severity badges ── */
.badge {{
    display: inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 8.5pt;
    font-weight: bold;
    line-height: 1.4;
}}
.risk-high   {{ background: #fee2e2; color: #b91c1c; }}
.risk-medium {{ background: #fef3c7; color: #b45309; }}
.risk-low    {{ background: #dcfce7; color: #15803d; }}
.sev-critical {{ background: #fee2e2; color: #b91c1c; }}
.sev-warning  {{ background: #fef3c7; color: #b45309; }}
.sev-info     {{ background: #dbeafe; color: #1d4ed8; }}

/* ── Findings ── */
.finding {{
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 6px;
    page-break-inside: avoid;
}}
.finding.sev-critical {{ border-right: 4px solid #dc2626; }}
.finding.sev-warning  {{ border-right: 4px solid #d97706; }}
.finding.sev-info     {{ border-right: 4px solid #2563eb; }}
.finding-title {{
    font-weight: bold;
    font-size: 10pt;
    color: #0f172a;
    margin-bottom: 4px;
}}
.finding-desc {{
    font-size: 9pt;
    color: #374151;
    margin-bottom: 5px;
}}
.finding-sources {{
    font-size: 8pt;
    color: #94a3b8;
}}

/* ── Red flags ── */
.flag-item {{
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid #fef2f2;
    font-size: 9.5pt;
    color: #7f1d1d;
}}
.flag-dot {{
    color: #dc2626;
    font-size: 12pt;
    line-height: 1;
    flex-shrink: 0;
}}

/* ── Timeline ── */
.timeline-item {{
    display: flex;
    gap: 10px;
    padding: 5px 0;
    border-bottom: 1px solid #f1f5f9;
    font-size: 9pt;
}}
.timeline-date {{
    color: #1e40af;
    font-weight: bold;
    min-width: 90px;
    flex-shrink: 0;
}}

/* ── UBO edges ── */
.ubo-item {{
    font-size: 9pt;
    padding: 4px 8px;
    border-bottom: 1px solid #f1f5f9;
    color: #374151;
}}

/* ── Signing summary ── */
.signing-bar-wrap {{
    background: #f1f5f9;
    border-radius: 999px;
    height: 8px;
    margin: 6px 0 10px;
    overflow: hidden;
}}
.signing-bar {{
    background: #1e40af;
    height: 8px;
    border-radius: 999px;
}}
.signing-pct {{
    font-size: 18pt;
    font-weight: bold;
    color: #1e40af;
}}
"""

_HTML_TEMPLATE = """<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<style>{{ css }}</style>
</head>
<body>

<!-- ── Cover ── -->
<div class="cover">
  <div class="cover-logo">D-DONE</div>
  <div class="cover-title">{{ project_title }}</div>
  <div class="cover-subtitle">דוח בדיקת נאותות</div>
  <div>
    <span class="badge cover-risk {{ risk_class }}">רמת סיכון: {{ risk_label }}</span>
  </div>
  <div class="cover-meta">תאריך הפקה: {{ today }}</div>
  {% if client_name %}
  <div class="cover-meta">לקוח: {{ client_name }}</div>
  {% endif %}
  {% if doc_count %}
  <div class="cover-meta">מסמכים שנותחו: {{ doc_count }}</div>
  {% endif %}
</div>

<!-- ── 1. Executive Summary ── -->
<div class="section">
  <div class="section-header">
    <span class="section-num">1</span>
    <span class="section-title">סיכום מנהלים</span>
    <span style="margin-right: auto;">
      <span class="badge {{ risk_class }}">{{ risk_label }}</span>
    </span>
  </div>
  <div class="section-body">
    <p>{{ summary }}</p>
    {% if recommendation %}
    <p style="margin-top:8px; font-weight:bold; color:#475569;">המלצה:</p>
    <p>{{ recommendation }}</p>
    {% endif %}
    {% if key_risks %}
    <p style="margin-top:8px; font-weight:bold; color:#475569;">סיכונים עיקריים:</p>
    <ul style="padding-right:16px; margin-top:4px;">
      {% for r in key_risks %}<li>{{ r }}</li>{% endfor %}
    </ul>
    {% endif %}
  </div>
</div>

{% if compound_details %}
<!-- ── 2. Compound Details ── -->
<div class="section">
  <div class="section-header">
    <span class="section-num">2</span>
    <span class="section-title">פרטי המתחם</span>
  </div>
  <div class="section-body">
    <table class="kv-table">
      {% if compound_details.address %}<tr><td>כתובת</td><td>{{ compound_details.address }}</td></tr>{% endif %}
      {% if compound_details.gush %}<tr><td>גוש</td><td>{{ compound_details.gush }}</td></tr>{% endif %}
      {% if compound_details.helka %}<tr><td>חלקה</td><td>{{ compound_details.helka }}</td></tr>{% endif %}
      {% if compound_details.incoming_state %}
      <tr><td>מצב לפני הריסה</td><td>{{ compound_details.incoming_state.building_count or '—' }} בניינים, {{ compound_details.incoming_state.apartment_count or '—' }} דירות</td></tr>
      {% endif %}
      {% if compound_details.outgoing_state %}
      <tr><td>מצב לאחר בנייה</td><td>{{ compound_details.outgoing_state.building_count or '—' }} בניינים, {{ compound_details.outgoing_state.apartment_count or '—' }} דירות</td></tr>
      {% endif %}
      {% if compound_details.discrepancy_note %}<tr><td>פערים</td><td>{{ compound_details.discrepancy_note }}</td></tr>{% endif %}
    </table>
  </div>
</div>
{% endif %}

{% if tenant_table %}
<!-- ── 3. Tenant Table ── -->
<div class="section">
  <div class="section-header">
    <span class="section-num">3</span>
    <span class="section-title">טבלת דיירים</span>
    <span style="margin-right: auto; font-size:9pt; color:#64748b;">
      <span class="signing-pct">{{ signing_pct }}%</span> חתמו
    </span>
  </div>
  <div class="section-body" style="padding:0;">
    <div style="padding: 8px 14px 10px;">
      <div class="signing-bar-wrap">
        <div class="signing-bar" style="width:{{ signing_pct }}%;"></div>
      </div>
    </div>
    <table class="data-table">
      <thead>
        <tr>
          <th>חלקה</th>
          <th>שם בעלים</th>
          <th>חתם</th>
          <th>תאריך חתימה</th>
          <th>הע׳ אזהרה ליזם</th>
          <th>הערה מגבילה</th>
          <th>משכנתא</th>
          <th>הערות</th>
        </tr>
      </thead>
      <tbody>
        {% for row in tenant_table %}
        <tr>
          <td>{{ row.helka or row.sub_parcel or '—' }}</td>
          <td>{{ row.owner_name or '—' }}</td>
          <td style="text-align:center;">{{ bool_he(row.is_signed) }}</td>
          <td>{{ row.date_signed or '—' }}</td>
          <td style="text-align:center;">{{ bool_he(row.is_warning_note_registered) }}</td>
          <td style="text-align:center;">{{ bool_he(row.restrictive_note_registered) }}</td>
          <td style="text-align:center;">{{ bool_he(row.is_mortgage_registered) }}</td>
          <td>{{ row.notes or '' }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
  </div>
</div>
{% endif %}

{% if developer_signature %}
<!-- ── 4. Developer Signature ── -->
<div class="section">
  <div class="section-header">
    <span class="section-num">4</span>
    <span class="section-title">חתימת היזם</span>
  </div>
  <div class="section-body">
    <table class="kv-table">
      {% if developer_signature.developer_signed_date %}<tr><td>תאריך חתימה</td><td>{{ developer_signature.developer_signed_date }}</td></tr>{% endif %}
      {% if developer_signature.authorized_signatory_name %}<tr><td>מורשה חתימה</td><td>{{ developer_signature.authorized_signatory_name }}</td></tr>{% endif %}
      {% if developer_signature.authorized_signatory_id %}<tr><td>ת.ז.</td><td>{{ developer_signature.authorized_signatory_id }}</td></tr>{% endif %}
      {% if developer_signature.signing_protocol_authorized is not none %}
      <tr><td>אישור פרוטוקול</td><td>{{ 'מאושר ✓' if developer_signature.signing_protocol_authorized else 'אי-התאמה ✗' }}</td></tr>
      {% endif %}
    </table>
  </div>
</div>
{% endif %}

{% if power_of_attorney %}
<!-- ── 5. Legal Representatives ── -->
<div class="section">
  <div class="section-header">
    <span class="section-num">5</span>
    <span class="section-title">באי כוח</span>
  </div>
  <div class="section-body">
    <table class="kv-table">
      {% if power_of_attorney.developer_attorney %}<tr><td>בא כוח היזם</td><td>{{ power_of_attorney.developer_attorney }}</td></tr>{% endif %}
      {% if power_of_attorney.owners_attorney %}<tr><td>בא כוח הבעלים</td><td>{{ power_of_attorney.owners_attorney }}</td></tr>{% endif %}
    </table>
  </div>
</div>
{% endif %}

{% if financing %}
<!-- ── 6. Financing Body ── -->
<div class="section">
  <div class="section-header">
    <span class="section-num">6</span>
    <span class="section-title">גוף המימון</span>
  </div>
  <div class="section-body">
    <table class="kv-table">
      {% if financing.lender_definition_clause %}<tr><td>הגדרת מממן בהסכם</td><td>{{ financing.lender_definition_clause }}</td></tr>{% endif %}
      {% if financing.actual_lender %}<tr><td>מממן בפועל</td><td>{{ financing.actual_lender }}</td></tr>{% endif %}
      {% if financing.lender_compliance_note %}<tr><td>עמידה בתנאים</td><td>{{ financing.lender_compliance_note }}</td></tr>{% endif %}
      {% if financing.mezzanine_loan_exists is not none %}
      <tr><td>הלוואת מזנין</td><td>{{ bool_he(financing.mezzanine_loan_exists) }}</td></tr>
      {% endif %}
      {% if financing.mezzanine_loan_details %}<tr><td>פרטי מזנין</td><td>{{ financing.mezzanine_loan_details }}</td></tr>{% endif %}
    </table>
  </div>
</div>
{% endif %}

{% if zero_report_metrics %}
<!-- ── 7. Zero Report ── -->
<div class="section">
  <div class="section-header">
    <span class="section-num">7</span>
    <span class="section-title">דו"ח אפס</span>
  </div>
  <div class="section-body">
    <table class="kv-table">
      {% if zero_report_metrics.addressee %}<tr><td>נמען הדוח</td><td>{{ zero_report_metrics.addressee }}</td></tr>{% endif %}
      {% if zero_report_metrics.profit_on_turnover is not none %}<tr><td>רווח למחזור</td><td>{{ "%.1f%%"|format(zero_report_metrics.profit_on_turnover * 100) }}</td></tr>{% endif %}
      {% if zero_report_metrics.profit_on_cost is not none %}<tr><td>רווח לעלות</td><td>{{ "%.1f%%"|format(zero_report_metrics.profit_on_cost * 100) }}</td></tr>{% endif %}
      {% if zero_report_metrics.indexation_details %}<tr><td>הצמדה למדד</td><td>{{ zero_report_metrics.indexation_details }}</td></tr>{% endif %}
      {% if zero_report_metrics.zero_report_date_formatted %}<tr><td>תאריך הדוח</td><td>{{ zero_report_metrics.zero_report_date_formatted }}</td></tr>{% endif %}
    </table>
    {% if zero_report_metrics.construction_restrictions %}
    <p style="font-weight:bold; color:#475569; margin-top:8px;">מגבלות בנייה:</p>
    <ul style="padding-right:16px; margin-top:4px; font-size:9pt;">
      {% for r in zero_report_metrics.construction_restrictions %}<li>{{ r }}</li>{% endfor %}
    </ul>
    {% endif %}
  </div>
</div>
{% endif %}

{% if ubo_chain or ubo_edges %}
<!-- ── 8. UBO Chain ── -->
<div class="section">
  <div class="section-header">
    <span class="section-num">8</span>
    <span class="section-title">שרשרת בעלות (UBO)</span>
  </div>
  <div class="section-body" style="padding:0;">
    {% if ubo_edges %}
    <table class="data-table">
      <thead><tr><th>בעלים</th><th>חברה</th><th>אחוז</th></tr></thead>
      <tbody>
        {% for edge in ubo_edges %}
        <tr>
          <td>{{ edge.from_name }}</td>
          <td>{{ edge.to_name }}</td>
          <td>{{ edge.share_pct or '—' }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
    {% elif ubo_chain %}
    <div style="padding: 10px 14px;">
      {% for item in ubo_chain %}<div class="ubo-item">{{ item }}</div>{% endfor %}
    </div>
    {% endif %}
  </div>
</div>
{% endif %}

{% if high_risk_flags %}
<!-- ── 9. Red Flags ── -->
<div class="section">
  <div class="section-header">
    <span class="section-num">9</span>
    <span class="section-title">דגלים אדומים</span>
    <span style="margin-right:auto;">
      <span class="badge risk-high">{{ high_risk_flags|length }} ממצאים</span>
    </span>
  </div>
  <div class="section-body" style="padding: 4px 14px;">
    {% for flag in high_risk_flags %}
    <div class="flag-item">
      <span class="flag-dot">●</span>
      <span>{{ flag }}</span>
    </div>
    {% endfor %}
  </div>
</div>
{% endif %}

{% if guarantee_findings %}
<!-- ── 10. Guarantees ── -->
<div class="section">
  <div class="section-header">
    <span class="section-num">10</span>
    <span class="section-title">ערבויות ובטחונות</span>
  </div>
  <div class="section-body" style="padding:0;">
    <table style="width:100%; border-collapse:collapse; font-size:9pt; direction:rtl;">
      <thead>
        <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0;">
          <th style="padding:8px 14px; text-align:right; font-weight:600; color:#475569; width:30%;">ערבות</th>
          <th style="padding:8px 14px; text-align:right; font-weight:600; color:#475569;">הסבר</th>
        </tr>
      </thead>
      <tbody>
        {% for f in guarantee_findings %}
        <tr style="background:{{ 'white' if loop.index is odd else '#f8fafc' }}; border-bottom:1px solid #f1f5f9;">
          <td style="padding:8px 14px; font-weight:500; color:#1e293b; vertical-align:top;">
            {% if f.severity == 'warning' %}
            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#d97706; margin-left:6px; vertical-align:middle;"></span>
            {% endif %}
            {{ f.title }}
          </td>
          <td style="padding:8px 14px; color:#475569; vertical-align:top;">{{ f.description }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
  </div>
</div>
{% endif %}

{% if findings %}
<!-- ── 11. Findings ── -->
<div class="section">
  <div class="section-header">
    <span class="section-num">11</span>
    <span class="section-title">ממצאים</span>
    <span style="margin-right:auto; font-size:9pt; color:#64748b;">{{ findings|length }} ממצאים</span>
  </div>
  <div class="section-body">
    {% for f in findings %}
    <div class="finding {{ sev_class(f.severity) }}">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
        <span class="badge {{ sev_class(f.severity) }}">{{ sev_label(f.severity) }}</span>
        <span class="finding-title">{{ f.title }}</span>
      </div>
      <div class="finding-desc">{{ f.description }}</div>
      {% if f.sources %}
      <div class="finding-sources">
        מקורות: {{ f.sources | map(attribute='source_document_name') | join(', ') }}
        {% if f.sources[0].page_number %} — עמ' {{ f.sources[0].page_number }}{% endif %}
      </div>
      {% endif %}
    </div>
    {% endfor %}
  </div>
</div>
{% endif %}

{% if timeline %}
<!-- ── 12. Timeline ── -->
<div class="section">
  <div class="section-header">
    <span class="section-num">12</span>
    <span class="section-title">לוחות זמנים</span>
  </div>
  <div class="section-body" style="padding: 4px 14px;">
    {% for ev in timeline %}
    <div class="timeline-item">
      <span class="timeline-date">{{ ev.date }}</span>
      <span>{{ ev.event_description }}</span>
    </div>
    {% endfor %}
  </div>
</div>
{% endif %}

</body>
</html>
"""


def _bool_he(v: Any) -> str:
    if v is True:
        return "✓"
    if v is False:
        return "✗"
    return "—"


def _sev_class(sev: str) -> str:
    return SEV_CLASS.get(sev, "sev-info")


def _sev_label(sev: str) -> str:
    return SEV_LABEL.get(sev, sev)


def _signing_pct(pct: float) -> int:
    if pct <= 1:
        return round(pct * 100)
    return round(pct)


def _ubo_edges(report: RealEstateFinanceDDReport) -> list[dict]:
    if not report.developer_ubo_graph:
        return []
    node_map = {n.id: n.name for n in report.developer_ubo_graph.nodes}
    return [
        {
            "from_name": node_map.get(e.from_id, e.from_id),
            "to_name": node_map.get(e.to_id, e.to_id),
            "share_pct": e.share_pct,
        }
        for e in report.developer_ubo_graph.edges
    ]


def _render_finance(report: RealEstateFinanceDDReport, project_title: str) -> str:
    es = report.executive_summary
    risk_label = RISK_LABEL.get(es.risk_level, es.risk_level)
    risk_class = RISK_CLASS.get(es.risk_level, "risk-medium")

    recommendation = getattr(es, "recommendation", None)
    key_risks = getattr(es, "key_risks", []) or []

    client_name = None
    doc_count = None
    if report.project_header:
        client_name = report.project_header.client_name
        doc_count = report.project_header.doc_count

    css = _CSS.format(font_path=_FONT_PATH.as_posix())

    env = Environment(loader=BaseLoader())
    env.globals["bool_he"] = _bool_he
    env.globals["sev_class"] = _sev_class
    env.globals["sev_label"] = _sev_label

    all_findings = report.findings or []
    guarantee_findings = [f for f in all_findings if getattr(f, "category", None) == "financial"]
    other_findings = [f for f in all_findings if getattr(f, "category", None) != "financial"]

    tpl = env.from_string(_HTML_TEMPLATE)
    return tpl.render(
        css=css,
        project_title=project_title,
        today=date.today().strftime("%d/%m/%Y"),
        risk_label=risk_label,
        risk_class=risk_class,
        summary=es.summary,
        recommendation=recommendation,
        key_risks=key_risks,
        client_name=client_name,
        doc_count=doc_count,
        compound_details=report.compound_details,
        tenant_table=report.tenant_table,
        signing_pct=_signing_pct(report.signing_percentage),
        developer_signature=report.developer_signature,
        power_of_attorney=report.power_of_attorney,
        financing=report.financing,
        zero_report_metrics=report.zero_report_metrics,
        ubo_chain=report.developer_ubo_chain,
        ubo_edges=_ubo_edges(report),
        high_risk_flags=report.high_risk_flags,
        guarantee_findings=guarantee_findings,
        findings=other_findings,
        timeline=getattr(report, "timeline", []) or [],
    )


def _render_standard(report: DDReport, project_title: str) -> str:
    es = report.executive_summary
    risk_label = RISK_LABEL.get(es.risk_level, es.risk_level)
    risk_class = RISK_CLASS.get(es.risk_level, "risk-medium")
    recommendation = getattr(es, "recommendation", None)
    key_risks = getattr(es, "key_risks", []) or []

    css = _CSS.format(font_path=_FONT_PATH.as_posix())

    env = Environment(loader=BaseLoader())
    env.globals["bool_he"] = _bool_he
    env.globals["sev_class"] = _sev_class
    env.globals["sev_label"] = _sev_label

    tpl = env.from_string(_HTML_TEMPLATE)
    return tpl.render(
        css=css,
        project_title=project_title,
        today=date.today().strftime("%d/%m/%Y"),
        risk_label=risk_label,
        risk_class=risk_class,
        summary=es.summary,
        recommendation=recommendation,
        key_risks=key_risks,
        client_name=None,
        doc_count=None,
        compound_details=None,
        tenant_table=[],
        signing_pct=0,
        developer_signature=None,
        power_of_attorney=None,
        financing=None,
        zero_report_metrics=None,
        ubo_chain=[],
        ubo_edges=[],
        high_risk_flags=[],
        guarantee_findings=[],
        findings=report.findings,
        timeline=getattr(report, "timeline", []) or [],
    )


def generate_pdf_report(
    report: DDReport | RealEstateFinanceDDReport,
    project_title: str,
) -> bytes:
    """Render the report as a styled PDF via WeasyPrint → HTML → PDF."""
    from weasyprint import HTML, CSS  # type: ignore[import]

    if isinstance(report, RealEstateFinanceDDReport):
        html_str = _render_finance(report, project_title)
    else:
        html_str = _render_standard(report, project_title)

    buf = io.BytesIO()
    HTML(string=html_str).write_pdf(buf)
    buf.seek(0)
    return buf.read()
