"""Word document export service for DD reports.

Generates a Hebrew RTL .docx file from a RealEstateFinanceDDReport or DDReport.
Uses python-docx with manual XML tweaks for right-to-left paragraph support.
"""

from __future__ import annotations

import io
from datetime import date
from typing import Any

from docx import Document
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

from app.agents.schemas import (
    DDReport,
    RealEstateFinanceDDReport,
    Finding,
    TenantRow,
)

# ---------------------------------------------------------------------------
# RTL helpers
# ---------------------------------------------------------------------------

RISK_LABEL_HE = {"high": "גבוה", "medium": "בינוני", "low": "נמוך"}
SEVERITY_LABEL_HE = {"critical": "קריטי", "warning": "אזהרה", "info": "מידע"}
BOOL_HE = {True: "כן", False: "לא", None: "—"}



def _set_rtl_paragraph(para: Any) -> None:
    """Add RTL + right-alignment to an existing paragraph."""
    pPr = para._p.get_or_add_pPr()
    _ensure_bidi(pPr)
    _ensure_jc_right(pPr)


def _set_rtl_run(run: Any) -> None:
    """Add <w:rtl/> to a run's rPr so the font renders RTL."""
    rPr = run._r.get_or_add_rPr()
    rtl = rPr.find(qn("w:rtl"))
    if rtl is None:
        rtl = OxmlElement("w:rtl")
        rPr.append(rtl)


def _add_rtl_paragraph(doc: Document, text: str, style: str | None = None) -> Any:
    """Add a new RTL paragraph with the given text and optional style."""
    if style:
        para = doc.add_paragraph(style=style)
    else:
        para = doc.add_paragraph()
    _set_rtl_paragraph(para)
    run = para.add_run(text)
    _set_rtl_run(run)
    return para


def _add_heading(doc: Document, text: str, level: int = 1) -> Any:
    """Add an RTL heading."""
    para = doc.add_heading(level=level)
    para.clear()
    _set_rtl_paragraph(para)
    run = para.add_run(text)
    _set_rtl_run(run)
    return para


def _add_bold_label(doc: Document, label: str, value: str | None) -> None:
    """Add a paragraph like: **label:** value."""
    if not value:
        return
    para = doc.add_paragraph()
    _set_rtl_paragraph(para)
    bold_run = para.add_run(f"{label}: ")
    bold_run.bold = True
    _set_rtl_run(bold_run)
    val_run = para.add_run(value)
    _set_rtl_run(val_run)


def _set_table_rtl(table: Any) -> None:
    """Set RTL on a whole table's tblPr."""
    tblPr = table._tbl.find(qn("w:tblPr"))
    if tblPr is None:
        tblPr = OxmlElement("w:tblPr")
        table._tbl.insert(0, tblPr)
    bidi = tblPr.find(qn("w:bidiVisual"))
    if bidi is None:
        bidi = OxmlElement("w:bidiVisual")
        tblPr.append(bidi)


def _cell_rtl(cell: Any, text: str, bold: bool = False) -> None:
    """Set cell text with RTL alignment."""
    cell.text = ""
    para = cell.paragraphs[0]
    _set_rtl_paragraph(para)
    run = para.add_run(text)
    _set_rtl_run(run)
    if bold:
        run.bold = True


# ---------------------------------------------------------------------------
# Finance report builder
# ---------------------------------------------------------------------------


def _build_finance_report(doc: Document, report: RealEstateFinanceDDReport, project_title: str) -> None:
    # ---- Cover ----
    title_para = doc.add_heading(level=0)
    title_para.clear()
    _set_rtl_paragraph(title_para)
    run = title_para.add_run(f"דוח בדיקת נאותות — {project_title}")
    _set_rtl_run(run)

    date_str = date.today().strftime("%d/%m/%Y")
    _add_rtl_paragraph(doc, f"תאריך הפקה: {date_str}")

    if report.project_header:
        h = report.project_header
        if h.client_name:
            _add_rtl_paragraph(doc, f"לקוח: {h.client_name}")
        if h.status:
            _add_rtl_paragraph(doc, f"סטטוס: {h.status}")
        if h.doc_count is not None:
            _add_rtl_paragraph(doc, f"מסמכים שנותחו: {h.doc_count}")

    doc.add_page_break()

    # ---- 1. Executive Summary ----
    _add_heading(doc, "1. סיכום מנהלים", level=1)
    es = report.executive_summary
    risk_label = RISK_LABEL_HE.get(es.risk_level, es.risk_level)
    _add_bold_label(doc, "רמת סיכון", risk_label)
    _add_bold_label(doc, "סיכום", es.summary)
    _add_bold_label(doc, "המלצה", es.recommendation)

    if es.key_risks:
        para = doc.add_paragraph()
        _set_rtl_paragraph(para)
        r = para.add_run("סיכונים עיקריים:")
        r.bold = True
        _set_rtl_run(r)
        for risk in es.key_risks:
            p = doc.add_paragraph(style="List Bullet")
            _set_rtl_paragraph(p)
            run = p.add_run(risk)
            _set_rtl_run(run)

    # ---- 2. Timeline ----
    if report.timeline:
        _add_heading(doc, "2. ציר הזמן", level=1)
        table = doc.add_table(rows=1, cols=2)
        table.style = "Table Grid"
        _set_table_rtl(table)
        hdr = table.rows[0].cells
        _cell_rtl(hdr[0], "תאריך", bold=True)
        _cell_rtl(hdr[1], "אירוע", bold=True)
        for event in report.timeline:
            row = table.add_row().cells
            _cell_rtl(row[0], event.date or "")
            _cell_rtl(row[1], event.event_description or "")
        doc.add_paragraph()

    # ---- 3. Compound Details ----
    if report.compound_details:
        _add_heading(doc, "3. פרטי המתחם", level=1)
        cd = report.compound_details
        _add_bold_label(doc, "כתובת", cd.address)
        _add_bold_label(doc, "גוש", cd.gush)
        _add_bold_label(doc, "חלקה", cd.helka)
        if cd.incoming_state:
            s = cd.incoming_state
            _add_bold_label(doc, "מצב לפני הריסה",
                            f"{s.building_count or '—'} בניינים, {s.apartment_count or '—'} דירות")
        if cd.outgoing_state:
            s = cd.outgoing_state
            _add_bold_label(doc, "מצב לאחר בנייה",
                            f"{s.building_count or '—'} בניינים, {s.apartment_count or '—'} דירות")
        _add_bold_label(doc, "פערים", cd.discrepancy_note)

    # ---- 4. Tenant Table ----
    if report.tenant_table:
        _add_heading(doc, "4. טבלת דיירים", level=1)

        signing_pct = report.signing_percentage or 0
        if signing_pct <= 1:
            signing_pct = round(signing_pct * 100)
        else:
            signing_pct = round(signing_pct)
        _add_rtl_paragraph(doc, f"אחוז חתימות: {signing_pct}%")

        cols = ["תת-חלקה", "שם בעלים", "חתם", "תאריך חתימה", "הערת אזהרה", "משכנתא", "הערות"]
        table = doc.add_table(rows=1, cols=len(cols))
        table.style = "Table Grid"
        _set_table_rtl(table)
        hdr = table.rows[0].cells
        for i, col in enumerate(cols):
            _cell_rtl(hdr[i], col, bold=True)

        for row_data in report.tenant_table:
            row = table.add_row().cells
            _cell_rtl(row[0], row_data.sub_parcel or row_data.helka or "")
            _cell_rtl(row[1], row_data.owner_name or "")
            _cell_rtl(row[2], BOOL_HE[row_data.is_signed])
            _cell_rtl(row[3], row_data.date_signed or "")
            _cell_rtl(row[4], BOOL_HE[row_data.is_warning_note_registered])
            _cell_rtl(row[5], BOOL_HE[row_data.is_mortgage_registered])
            _cell_rtl(row[6], row_data.notes or "")
        doc.add_paragraph()

    # ---- 5. Developer Signature ----
    if report.developer_signature:
        _add_heading(doc, "5. חתימת היזם", level=1)
        ds = report.developer_signature
        _add_bold_label(doc, "תאריך חתימת יזם", ds.developer_signed_date)
        _add_bold_label(doc, "שם מורשה חתימה", ds.authorized_signatory_name)
        _add_bold_label(doc, "ת.ז. מורשה חתימה", ds.authorized_signatory_id)
        if ds.signing_protocol_authorized is not None:
            _add_bold_label(doc, "אישור פרוטוקול חתימה",
                            "מאושר" if ds.signing_protocol_authorized else "אי-התאמה")

    # ---- 6. Power of Attorney ----
    if report.power_of_attorney:
        _add_heading(doc, "6. באי כוח", level=1)
        poa = report.power_of_attorney
        _add_bold_label(doc, "בא כוח היזם", poa.developer_attorney)
        _add_bold_label(doc, "בא כוח הבעלים", poa.owners_attorney)

    # ---- 7. Financing Body ----
    if report.financing:
        _add_heading(doc, "7. גוף המימון", level=1)
        fin = report.financing
        _add_bold_label(doc, "הגדרת מממן בהסכם", fin.lender_definition_clause)
        _add_bold_label(doc, "מממן בפועל", fin.actual_lender)
        _add_bold_label(doc, "עמידה בתנאים", fin.lender_compliance_note)
        if fin.mezzanine_loan_exists is not None:
            _add_bold_label(doc, "הלוואת מזנין", BOOL_HE[fin.mezzanine_loan_exists])
        _add_bold_label(doc, "פרטי מזנין", fin.mezzanine_loan_details)

    # ---- 8. Zero Report Metrics ----
    if report.zero_report_metrics:
        _add_heading(doc, "8. דו\"ח אפס", level=1)
        zr = report.zero_report_metrics
        _add_bold_label(doc, "נמען הדוח", zr.addressee)
        if zr.profit_on_turnover is not None:
            _add_bold_label(doc, "רווח למחזור", f"{zr.profit_on_turnover:.1%}")
        if zr.profit_on_cost is not None:
            _add_bold_label(doc, "רווח לעלות", f"{zr.profit_on_cost:.1%}")
        _add_bold_label(doc, "הצמדה למדד", zr.indexation_details)
        if zr.construction_restrictions:
            para = doc.add_paragraph()
            _set_rtl_paragraph(para)
            r = para.add_run("מגבלות בנייה:")
            r.bold = True
            _set_rtl_run(r)
            for restriction in zr.construction_restrictions:
                p = doc.add_paragraph(style="List Bullet")
                _set_rtl_paragraph(p)
                run = p.add_run(restriction)
                _set_rtl_run(run)

    # ---- 9. Finance Analysis ----
    if report.finance_analysis:
        _add_heading(doc, "9. ניתוח פיננסי", level=1)
        fa = report.finance_analysis
        if fa.lender_definition_match is not None:
            _add_bold_label(doc, "התאמת הגדרת מממן",
                            "תואם" if fa.lender_definition_match else "אי-התאמה")
        _add_bold_label(doc, "פרטי אי-התאמה", fa.discrepancy_note)
        if fa.equity_confirmed is not None:
            _add_bold_label(doc, "אישור הון עצמי", BOOL_HE[fa.equity_confirmed])

    # ---- 10. Corporate Governance / UBO ----
    if report.developer_ubo_chain:
        _add_heading(doc, "10. שרשרת בעלות (UBO)", level=1)
        for item in report.developer_ubo_chain:
            p = doc.add_paragraph(style="List Bullet")
            _set_rtl_paragraph(p)
            run = p.add_run(item)
            _set_rtl_run(run)

    if report.developer_ubo_graph and report.developer_ubo_graph.edges:
        _add_heading(doc, "קשרי בעלות", level=2)
        graph = report.developer_ubo_graph
        node_map = {n.id: n.name for n in graph.nodes}
        table = doc.add_table(rows=1, cols=3)
        table.style = "Table Grid"
        _set_table_rtl(table)
        hdr = table.rows[0].cells
        _cell_rtl(hdr[0], "בעלים", bold=True)
        _cell_rtl(hdr[1], "חברה", bold=True)
        _cell_rtl(hdr[2], "אחוז החזקה", bold=True)
        for edge in graph.edges:
            row = table.add_row().cells
            _cell_rtl(row[0], node_map.get(edge.from_id, edge.from_id))
            _cell_rtl(row[1], node_map.get(edge.to_id, edge.to_id))
            _cell_rtl(row[2], edge.share_pct or "—")
        doc.add_paragraph()

    # ---- 11. High Risk Flags ----
    if report.high_risk_flags:
        _add_heading(doc, "11. דגלים אדומים", level=1)
        for flag in report.high_risk_flags:
            p = doc.add_paragraph(style="List Bullet")
            _set_rtl_paragraph(p)
            run = p.add_run(flag)
            _set_rtl_run(run)

    # ---- 12. Findings ----
    if report.findings:
        _add_heading(doc, "12. ממצאים", level=1)
        _build_findings(doc, report.findings)


# ---------------------------------------------------------------------------
# Standard DDReport builder
# ---------------------------------------------------------------------------


def _build_standard_report(doc: Document, report: DDReport, project_title: str) -> None:
    title_para = doc.add_heading(level=0)
    title_para.clear()
    _set_rtl_paragraph(title_para)
    run = title_para.add_run(f"דוח בדיקת נאותות — {project_title}")
    _set_rtl_run(run)

    date_str = date.today().strftime("%d/%m/%Y")
    _add_rtl_paragraph(doc, f"תאריך הפקה: {date_str}")
    doc.add_page_break()

    # Executive Summary
    _add_heading(doc, "1. סיכום מנהלים", level=1)
    es = report.executive_summary
    _add_bold_label(doc, "רמת סיכון", RISK_LABEL_HE.get(es.risk_level, es.risk_level))
    _add_bold_label(doc, "סיכום", es.summary)
    _add_bold_label(doc, "המלצה", es.recommendation)
    if es.key_risks:
        para = doc.add_paragraph()
        _set_rtl_paragraph(para)
        r = para.add_run("סיכונים עיקריים:")
        r.bold = True
        _set_rtl_run(r)
        for risk in es.key_risks:
            p = doc.add_paragraph(style="List Bullet")
            _set_rtl_paragraph(p)
            run = p.add_run(risk)
            _set_rtl_run(run)

    # Timeline
    if report.timeline:
        _add_heading(doc, "2. ציר הזמן", level=1)
        table = doc.add_table(rows=1, cols=2)
        table.style = "Table Grid"
        _set_table_rtl(table)
        hdr = table.rows[0].cells
        _cell_rtl(hdr[0], "תאריך", bold=True)
        _cell_rtl(hdr[1], "אירוע", bold=True)
        for event in report.timeline:
            row = table.add_row().cells
            _cell_rtl(row[0], event.date or "")
            _cell_rtl(row[1], event.event_description or "")
        doc.add_paragraph()

    # Findings
    if report.findings:
        _add_heading(doc, "3. ממצאים", level=1)
        _build_findings(doc, report.findings)

    # Documents Analyzed
    if report.documents_analyzed:
        _add_heading(doc, "4. מסמכים שנותחו", level=1)
        for doc_item in report.documents_analyzed:
            _add_bold_label(doc, doc_item.name, f"{doc_item.page_count} עמודים")


# ---------------------------------------------------------------------------
# Shared findings renderer
# ---------------------------------------------------------------------------


def _build_findings(doc: Document, findings: list[Finding]) -> None:
    for f in findings:
        severity_label = SEVERITY_LABEL_HE.get(f.severity, f.severity)
        # Title paragraph
        para = doc.add_heading(level=3)
        para.clear()
        _set_rtl_paragraph(para)
        run = para.add_run(f"[{severity_label}] {f.title}")
        _set_rtl_run(run)

        desc_para = doc.add_paragraph()
        _set_rtl_paragraph(desc_para)
        run = desc_para.add_run(f.description)
        _set_rtl_run(run)

        if f.sources:
            src_para = doc.add_paragraph()
            _set_rtl_paragraph(src_para)
            label_run = src_para.add_run("מקורות: ")
            label_run.bold = True
            _set_rtl_run(label_run)
            for i, src in enumerate(f.sources):
                if i > 0:
                    sep_run = src_para.add_run(" | ")
                    _set_rtl_run(sep_run)
                src_run = src_para.add_run(
                    f"{src.source_document_name} עמ' {src.page_number}"
                )
                _set_rtl_run(src_run)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


# OOXML schema: elements that must appear BEFORE <w:bidi> inside <w:pPr>
_PPR_BEFORE_BIDI = {
    qn("w:pStyle"), qn("w:keepNext"), qn("w:keepLines"),
    qn("w:pageBreakBefore"), qn("w:framePr"), qn("w:suppressLineNumbers"),
    qn("w:pBdr"), qn("w:shd"), qn("w:tabs"), qn("w:suppressAutoHyphens"),
    qn("w:kinsoku"), qn("w:wordWrap"), qn("w:overflowPunct"),
    qn("w:topLinePunct"), qn("w:autoSpaceDE"), qn("w:autoSpaceDN"),
}


def _ensure_bidi(pPr: Any) -> None:
    """Insert <w:bidi/> at the correct position in a <w:pPr> element."""
    if pPr.find(qn("w:bidi")) is not None:
        return
    bidi = OxmlElement("w:bidi")
    # Insert after the last element that must precede <w:bidi>
    insert_idx = 0
    for i, child in enumerate(pPr):
        if child.tag in _PPR_BEFORE_BIDI:
            insert_idx = i + 1
    pPr.insert(insert_idx, bidi)


def _ensure_jc_right(pPr: Any) -> None:
    """Set <w:jc w:val="right"/> in a <w:pPr>, replacing any existing value."""
    jc = pPr.find(qn("w:jc"))
    if jc is None:
        jc = OxmlElement("w:jc")
        pPr.append(jc)
    jc.set(qn("w:val"), "right")


def _configure_document_rtl(doc: Document) -> None:
    """Set RTL at the document-defaults and styles level so every element inherits it.

    <w:docDefaults> lives in styles.xml (doc.styles.element), NOT settings.xml.
    """
    styles_element = doc.styles.element

    # 1. Document defaults (<w:docDefaults> is a child of <w:styles>)
    docDefaults = styles_element.find(qn("w:docDefaults"))
    if docDefaults is not None:
        # pPrDefault → <w:bidi/> + right-align
        pPrDefault = docDefaults.find(qn("w:pPrDefault"))
        if pPrDefault is None:
            pPrDefault = OxmlElement("w:pPrDefault")
            docDefaults.insert(0, pPrDefault)
        pPr = pPrDefault.find(qn("w:pPr"))
        if pPr is None:
            pPr = OxmlElement("w:pPr")
            pPrDefault.append(pPr)
        _ensure_bidi(pPr)
        _ensure_jc_right(pPr)

        # rPrDefault → <w:rtl/>
        rPrDefault = docDefaults.find(qn("w:rPrDefault"))
        if rPrDefault is None:
            rPrDefault = OxmlElement("w:rPrDefault")
            docDefaults.append(rPrDefault)
        rPr = rPrDefault.find(qn("w:rPr"))
        if rPr is None:
            rPr = OxmlElement("w:rPr")
            rPrDefault.append(rPr)
        if rPr.find(qn("w:rtl")) is None:
            rPr.append(OxmlElement("w:rtl"))

    # 2. Patch every style so they inherit/enforce RTL
    for style in styles_element.findall(qn("w:style")):
        pPr = style.find(qn("w:pPr"))
        if pPr is None:
            pPr = OxmlElement("w:pPr")
            style.append(pPr)
        _ensure_bidi(pPr)
        _ensure_jc_right(pPr)

        rPr = style.find(qn("w:rPr"))
        if rPr is None:
            rPr = OxmlElement("w:rPr")
            style.append(rPr)
        if rPr.find(qn("w:rtl")) is None:
            rPr.append(OxmlElement("w:rtl"))


def generate_word_report(
    report: DDReport | RealEstateFinanceDDReport,
    project_title: str,
) -> bytes:
    """Generate a .docx file from a DD report and return its bytes."""
    doc = Document()
    _configure_document_rtl(doc)

    if isinstance(report, RealEstateFinanceDDReport):
        _build_finance_report(doc, report, project_title)
    else:
        _build_standard_report(doc, report, project_title)

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer.read()
