"""PDF export service for DD reports.

Generates a proper Hebrew RTL PDF using ReportLab + python-bidi.
Text is rendered using the Noto Sans Hebrew font which covers all Hebrew glyphs.
"""

from __future__ import annotations

import io
from datetime import date
from pathlib import Path
from typing import Any

from bidi.algorithm import get_display
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.agents.schemas import DDReport, RealEstateFinanceDDReport, Finding

# ---------------------------------------------------------------------------
# Font registration
# ---------------------------------------------------------------------------

_FONTS_DIR = Path(__file__).parent.parent.parent / "assets" / "fonts"
_FONT_REGULAR = _FONTS_DIR / "NotoSansHebrew.ttf"

_fonts_registered = False


def _register_fonts() -> None:
    global _fonts_registered
    if _fonts_registered:
        return
    pdfmetrics.registerFont(TTFont("NotoHebrew", str(_FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("NotoHebrew-Bold", str(_FONT_REGULAR)))
    _fonts_registered = True


# ---------------------------------------------------------------------------
# RTL text helpers
# ---------------------------------------------------------------------------

RISK_LABEL_HE = {"high": "גבוה", "medium": "בינוני", "low": "נמוך"}
SEVERITY_LABEL_HE = {"critical": "קריטי", "warning": "אזהרה", "info": "מידע"}
BOOL_HE: dict[Any, str] = {True: "כן", False: "לא", None: "—"}

# Risk level colors
RISK_COLORS = {
    "high": colors.HexColor("#dc2626"),
    "medium": colors.HexColor("#d97706"),
    "low": colors.HexColor("#16a34a"),
}
SEVERITY_COLORS = {
    "critical": colors.HexColor("#dc2626"),
    "warning": colors.HexColor("#d97706"),
    "info": colors.HexColor("#2563eb"),
}


def _rtl(text: str) -> str:
    """Convert logical Hebrew/mixed text to visual RTL order for PDF rendering."""
    if not text:
        return ""
    return get_display(str(text))


def _rtl_para(text: str, style: ParagraphStyle) -> Paragraph:
    """Create a ReportLab Paragraph with BiDi-reordered text."""
    return Paragraph(_rtl(text), style)


# ---------------------------------------------------------------------------
# Style sheet
# ---------------------------------------------------------------------------

def _make_styles() -> dict[str, ParagraphStyle]:
    _register_fonts()

    def _s(name: str, font: str = "NotoHebrew", ri: int = 0, ld: int = 16, **kw: Any) -> ParagraphStyle:
        return ParagraphStyle(
            name,
            fontName=font,
            alignment=TA_RIGHT,
            rightIndent=ri,
            leftIndent=0,
            leading=ld,
            **kw,
        )

    return {
        "title":     _s("title",     "NotoHebrew-Bold", fontSize=20, spaceAfter=6,
                        textColor=colors.HexColor("#1e293b")),
        "subtitle":  _s("subtitle",  fontSize=11, spaceAfter=10,
                        textColor=colors.HexColor("#64748b")),
        "h1":        _s("h1",        "NotoHebrew-Bold", fontSize=15, spaceAfter=4,
                        spaceBefore=14, textColor=colors.HexColor("#1e40af")),
        "h2":        _s("h2",        "NotoHebrew-Bold", fontSize=12, spaceAfter=4,
                        spaceBefore=10, textColor=colors.HexColor("#374151")),
        "h3":        _s("h3",        "NotoHebrew-Bold", fontSize=10, spaceAfter=2,
                        spaceBefore=8, textColor=colors.HexColor("#4b5563")),
        "body":      _s("body",      fontSize=10, spaceAfter=4),
        "label":     _s("label",     fontSize=10, spaceAfter=2),
        "bullet":    _s("bullet",    fontSize=10, spaceAfter=2, ri=10),
        "small":     _s("small",     fontSize=8,  spaceAfter=2,
                        textColor=colors.HexColor("#6b7280")),
        "cell":      _s("cell",      fontSize=8,  spaceAfter=0, ld=12),
        "cell_bold": _s("cell_bold", "NotoHebrew-Bold", fontSize=8, spaceAfter=0, ld=12),
    }


# ---------------------------------------------------------------------------
# Table helpers
# ---------------------------------------------------------------------------

_TABLE_HEADER_BG = colors.HexColor("#e2e8f0")
_TABLE_GRID = colors.HexColor("#cbd5e1")
_TABLE_ROW_ALT = colors.HexColor("#f8fafc")

_BASE_TABLE_STYLE = TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), _TABLE_HEADER_BG),
    ("GRID", (0, 0), (-1, -1), 0.5, _TABLE_GRID),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _TABLE_ROW_ALT]),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
])


def _cell(text: str, styles: dict, bold: bool = False) -> Paragraph:
    style = styles["cell_bold"] if bold else styles["cell"]
    return _rtl_para(str(text) if text is not None else "—", style)


def _hr() -> HRFlowable:
    return HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e2e8f0"),
                      spaceAfter=4, spaceBefore=4)


# ---------------------------------------------------------------------------
# Finance report builder
# ---------------------------------------------------------------------------

def _build_finance_report(
    story: list,
    report: RealEstateFinanceDDReport,
    project_title: str,
    styles: dict,
) -> None:
    # Cover
    story.append(_rtl_para(f"דוח בדיקת נאותות", styles["title"]))
    story.append(_rtl_para(project_title, styles["h1"]))
    date_str = date.today().strftime("%d/%m/%Y")
    story.append(_rtl_para(f"תאריך הפקה: {date_str}", styles["subtitle"]))

    if report.project_header:
        h = report.project_header
        if h.client_name:
            story.append(_rtl_para(f"לקוח: {h.client_name}", styles["subtitle"]))
        if h.doc_count is not None:
            story.append(_rtl_para(f"מסמכים שנותחו: {h.doc_count}", styles["subtitle"]))

    story.append(Spacer(1, 6 * mm))
    story.append(_hr())

    # 1. Executive Summary
    es = report.executive_summary
    risk_label = RISK_LABEL_HE.get(es.risk_level, es.risk_level)
    risk_color = RISK_COLORS.get(es.risk_level, colors.black)

    story.append(_rtl_para("1. סיכום מנהלים", styles["h1"]))
    story.append(_rtl_para(f"רמת סיכון: {risk_label}", ParagraphStyle(
        "risk", parent=styles["label"], textColor=risk_color,
        fontName="NotoHebrew-Bold",
    )))
    story.append(_rtl_para(es.summary, styles["body"]))
    story.append(_rtl_para("המלצה:", styles["h3"]))
    story.append(_rtl_para(es.recommendation, styles["body"]))
    if es.key_risks:
        story.append(_rtl_para("סיכונים עיקריים:", styles["h3"]))
        for risk in es.key_risks:
            story.append(_rtl_para(f"• {risk}", styles["bullet"]))

    # 2. Timeline
    if report.timeline:
        story.append(_hr())
        story.append(_rtl_para("2. ציר הזמן", styles["h1"]))
        page_w = A4[0] - 40 * mm
        col_w = [30 * mm, page_w - 30 * mm]
        data = [[_cell("תאריך", styles, bold=True), _cell("אירוע", styles, bold=True)]]
        for ev in report.timeline:
            data.append([_cell(ev.date or "", styles), _cell(ev.event_description or "", styles)])
        t = Table(data, colWidths=col_w)
        t.setStyle(_BASE_TABLE_STYLE)
        story.append(t)

    # 3. Compound Details
    if report.compound_details:
        story.append(_hr())
        story.append(_rtl_para("3. פרטי המתחם", styles["h1"]))
        cd = report.compound_details
        _kv(story, styles, "כתובת", cd.address)
        _kv(story, styles, "גוש", cd.gush)
        _kv(story, styles, "חלקה", cd.helka)
        if cd.incoming_state:
            s = cd.incoming_state
            _kv(story, styles, "מצב לפני הריסה",
                f"{s.building_count or '—'} בניינים, {s.apartment_count or '—'} דירות")
        if cd.outgoing_state:
            s = cd.outgoing_state
            _kv(story, styles, "מצב לאחר בנייה",
                f"{s.building_count or '—'} בניינים, {s.apartment_count or '—'} דירות")
        _kv(story, styles, "פערים", cd.discrepancy_note)

    # 4. Tenant Table
    if report.tenant_table:
        story.append(_hr())
        signing_pct = report.signing_percentage or 0
        if signing_pct <= 1:
            signing_pct = round(signing_pct * 100)
        else:
            signing_pct = round(signing_pct)
        story.append(_rtl_para(f"4. טבלת דיירים — {signing_pct}% חתמו", styles["h1"]))

        page_w = A4[0] - 40 * mm
        cols = ["תת-חלקה", "שם בעלים", "חתם", "תאריך", "הע׳ אזהרה", "משכנתא", "הערות"]
        col_w = [15 * mm, 30 * mm, 13 * mm, 18 * mm, 18 * mm, 18 * mm, page_w - 112 * mm]
        data = [[_cell(c, styles, bold=True) for c in cols]]
        for row in report.tenant_table:
            data.append([
                _cell(row.sub_parcel or row.helka or "", styles),
                _cell(row.owner_name or "", styles),
                _cell(BOOL_HE[row.is_signed], styles),
                _cell(row.date_signed or "", styles),
                _cell(BOOL_HE[row.is_warning_note_registered], styles),
                _cell(BOOL_HE[row.is_mortgage_registered], styles),
                _cell(row.notes or "", styles),
            ])
        t = Table(data, colWidths=col_w)
        t.setStyle(_BASE_TABLE_STYLE)
        story.append(t)

    # 5. Developer Signature
    if report.developer_signature:
        story.append(_hr())
        story.append(_rtl_para("5. חתימת היזם", styles["h1"]))
        ds = report.developer_signature
        _kv(story, styles, "תאריך חתימה", ds.developer_signed_date)
        _kv(story, styles, "מורשה חתימה", ds.authorized_signatory_name)
        _kv(story, styles, "ת.ז.", ds.authorized_signatory_id)
        if ds.signing_protocol_authorized is not None:
            _kv(story, styles, "אישור פרוטוקול",
                "מאושר" if ds.signing_protocol_authorized else "אי-התאמה")

    # 6. Power of Attorney
    if report.power_of_attorney:
        story.append(_hr())
        story.append(_rtl_para("6. באי כוח", styles["h1"]))
        _kv(story, styles, "בא כוח היזם", report.power_of_attorney.developer_attorney)
        _kv(story, styles, "בא כוח הבעלים", report.power_of_attorney.owners_attorney)

    # 7. Financing
    if report.financing:
        story.append(_hr())
        story.append(_rtl_para("7. גוף המימון", styles["h1"]))
        fin = report.financing
        _kv(story, styles, "הגדרת מממן בהסכם", fin.lender_definition_clause)
        _kv(story, styles, "מממן בפועל", fin.actual_lender)
        _kv(story, styles, "עמידה בתנאים", fin.lender_compliance_note)
        if fin.mezzanine_loan_exists is not None:
            _kv(story, styles, "הלוואת מזנין", BOOL_HE[fin.mezzanine_loan_exists])
        _kv(story, styles, "פרטי מזנין", fin.mezzanine_loan_details)

    # 8. Zero Report
    if report.zero_report_metrics:
        story.append(_hr())
        story.append(_rtl_para('8. דו"ח אפס', styles["h1"]))
        zr = report.zero_report_metrics
        _kv(story, styles, "נמען הדוח", zr.addressee)
        if zr.profit_on_turnover is not None:
            _kv(story, styles, "רווח למחזור", f"{zr.profit_on_turnover:.1%}")
        if zr.profit_on_cost is not None:
            _kv(story, styles, "רווח לעלות", f"{zr.profit_on_cost:.1%}")
        _kv(story, styles, "הצמדה למדד", zr.indexation_details)
        for r in zr.construction_restrictions:
            story.append(_rtl_para(f"• {r}", styles["bullet"]))

    # 9. Finance Analysis
    if report.finance_analysis:
        story.append(_hr())
        story.append(_rtl_para("9. ניתוח פיננסי", styles["h1"]))
        fa = report.finance_analysis
        if fa.lender_definition_match is not None:
            _kv(story, styles, "התאמת הגדרת מממן",
                "תואם" if fa.lender_definition_match else "אי-התאמה")
        _kv(story, styles, "פרטי אי-התאמה", fa.discrepancy_note)
        if fa.equity_confirmed is not None:
            _kv(story, styles, "אישור הון עצמי", BOOL_HE[fa.equity_confirmed])

    # 10. UBO Chain
    if report.developer_ubo_chain:
        story.append(_hr())
        story.append(_rtl_para("10. שרשרת בעלות (UBO)", styles["h1"]))
        for item in report.developer_ubo_chain:
            story.append(_rtl_para(f"• {item}", styles["bullet"]))

    if report.developer_ubo_graph and report.developer_ubo_graph.edges:
        story.append(_rtl_para("קשרי בעלות", styles["h2"]))
        graph = report.developer_ubo_graph
        node_map = {n.id: n.name for n in graph.nodes}
        page_w = A4[0] - 40 * mm
        col_w = [page_w / 3] * 3
        data = [[_cell("בעלים", styles, bold=True), _cell("חברה", styles, bold=True),
                 _cell("אחוז", styles, bold=True)]]
        for edge in graph.edges:
            data.append([
                _cell(node_map.get(edge.from_id, edge.from_id), styles),
                _cell(node_map.get(edge.to_id, edge.to_id), styles),
                _cell(edge.share_pct or "—", styles),
            ])
        t = Table(data, colWidths=col_w)
        t.setStyle(_BASE_TABLE_STYLE)
        story.append(t)

    # 11. High Risk Flags
    if report.high_risk_flags:
        story.append(_hr())
        story.append(_rtl_para("11. דגלים אדומים", styles["h1"]))
        for flag in report.high_risk_flags:
            story.append(_rtl_para(f"• {flag}", ParagraphStyle(
                "flag", parent=styles["bullet"], textColor=colors.HexColor("#dc2626"),
            )))

    # 12. Findings
    if report.findings:
        story.append(_hr())
        story.append(_rtl_para("12. ממצאים", styles["h1"]))
        _build_findings(story, report.findings, styles)


# ---------------------------------------------------------------------------
# Standard DDReport builder
# ---------------------------------------------------------------------------

def _build_standard_report(
    story: list,
    report: DDReport,
    project_title: str,
    styles: dict,
) -> None:
    story.append(_rtl_para("דוח בדיקת נאותות", styles["title"]))
    story.append(_rtl_para(project_title, styles["h1"]))
    story.append(_rtl_para(f"תאריך הפקה: {date.today().strftime('%d/%m/%Y')}", styles["subtitle"]))
    story.append(_hr())

    es = report.executive_summary
    story.append(_rtl_para("1. סיכום מנהלים", styles["h1"]))
    story.append(_rtl_para(
        f"רמת סיכון: {RISK_LABEL_HE.get(es.risk_level, es.risk_level)}",
        ParagraphStyle("risk", parent=styles["label"],
                       textColor=RISK_COLORS.get(es.risk_level, colors.black),
                       fontName="NotoHebrew-Bold"),
    ))
    story.append(_rtl_para(es.summary, styles["body"]))
    story.append(_rtl_para(es.recommendation, styles["body"]))
    for risk in es.key_risks:
        story.append(_rtl_para(f"• {risk}", styles["bullet"]))

    if report.timeline:
        story.append(_hr())
        story.append(_rtl_para("2. ציר הזמן", styles["h1"]))
        page_w = A4[0] - 40 * mm
        col_w = [30 * mm, page_w - 30 * mm]
        data = [[_cell("תאריך", styles, bold=True), _cell("אירוע", styles, bold=True)]]
        for ev in report.timeline:
            data.append([_cell(ev.date or "", styles), _cell(ev.event_description or "", styles)])
        t = Table(data, colWidths=col_w)
        t.setStyle(_BASE_TABLE_STYLE)
        story.append(t)

    if report.findings:
        story.append(_hr())
        story.append(_rtl_para("3. ממצאים", styles["h1"]))
        _build_findings(story, report.findings, styles)


# ---------------------------------------------------------------------------
# Shared findings renderer
# ---------------------------------------------------------------------------

def _build_findings(story: list, findings: list[Finding], styles: dict) -> None:
    for f in findings:
        sev_label = SEVERITY_LABEL_HE.get(f.severity, f.severity)
        sev_color = SEVERITY_COLORS.get(f.severity, colors.black)
        story.append(_rtl_para(
            f"[{sev_label}] {f.title}",
            ParagraphStyle("fh", parent=styles["h3"], textColor=sev_color),
        ))
        story.append(_rtl_para(f.description, styles["body"]))
        if f.sources:
            parts = " | ".join(
                f"{s.source_document_name} עמ' {s.page_number}" for s in f.sources
            )
            story.append(_rtl_para(f"מקורות: {parts}", styles["small"]))
        story.append(Spacer(1, 2 * mm))


# ---------------------------------------------------------------------------
# Key-value helper
# ---------------------------------------------------------------------------

def _kv(story: list, styles: dict, label: str, value: str | None) -> None:
    if not value:
        return
    story.append(_rtl_para(f"{label}: {value}", styles["label"]))


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def generate_pdf_report(
    report: DDReport | RealEstateFinanceDDReport,
    project_title: str,
) -> bytes:
    """Generate a .pdf file from a DD report and return its bytes."""
    _register_fonts()
    styles = _make_styles()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title=f"דוח בדיקת נאותות — {project_title}",
        author="D-Done",
    )

    story: list = []

    if isinstance(report, RealEstateFinanceDDReport):
        _build_finance_report(story, report, project_title, styles)
    else:
        _build_standard_report(story, report, project_title, styles)

    doc.build(story)
    buffer.seek(0)
    return buffer.read()
