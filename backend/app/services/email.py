"""Transactional email via Resend."""

from __future__ import annotations

import logging
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"


def _normalize_resend_from(raw: str) -> str:
    """Strip whitespace and accidental outer quotes from EMAIL_FROM (common .env mistake)."""
    s = (raw or "").strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        s = s[1:-1].strip()
    return s


def _load_invite_template() -> str:
    path = _TEMPLATE_DIR / "invite_email.html"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return (
        "<p>You are invited to D-Done.</p><p><a href=\"{invite_url}\">Accept invitation</a></p>"
    )


def send_vdr_upload_invitation(
    *,
    to_email: str,
    upload_url: str,
    project_name: str,
    inviter_name: str | None,
    expires_hours: int = 72,
) -> bool:
    """Send a VDR upload invitation to an external party."""
    if not settings.resend_api_key or not settings.email_from:
        logger.warning(
            "Resend not configured; skipping VDR invite email to %s", to_email
        )
        return False

    try:
        import resend  # type: ignore[import-untyped]
    except ImportError:
        logger.error("resend package not installed")
        return False

    resend.api_key = settings.resend_api_key
    from_addr = _normalize_resend_from(settings.email_from)
    if not from_addr:
        return False

    inviter_display = inviter_name or "D-Done"
    html = f"""
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;background:#f8f9fa;margin:0;padding:20px">
<div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <div style="text-align:center;margin-bottom:32px">
    <span style="font-size:28px;font-weight:700;letter-spacing:-1px;color:#0f172a">D<span style="color:#64748b">-Done</span></span>
  </div>
  <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a">הזמנה להעלאת מסמכים</h2>
  <p style="color:#475569;line-height:1.6;margin:0 0 8px">
    {inviter_display} מזמין/ת אותך להעלות מסמכי VDR עבור הפרויקט <strong>{project_name}</strong>.
  </p>
  <p style="color:#475569;line-height:1.6;margin:0 0 24px">
    הקישור תקף ל-{expires_hours} שעות.
  </p>
  <div style="text-align:center;margin:32px 0">
    <a href="{upload_url}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600">
      העלאת מסמכים
    </a>
  </div>
  <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center">
    אם לא ביקשת הזמנה זו, ניתן להתעלם ממייל זה.
  </p>
</div>
</body>
</html>
"""

    params: dict = {
        "from": from_addr,
        "to": [to_email],
        "subject": f"הזמנה להעלאת מסמכי VDR — {project_name}",
        "html": html,
    }

    try:
        resend.Emails.send(params)
        logger.info("VDR upload invitation sent to %s", to_email)
        return True
    except Exception as exc:
        logger.exception("Failed to send VDR invite email: %s", exc)
        return False


def send_vdr_completion_notification(
    *,
    to_email: str,
    project_name: str,
    project_url: str,
) -> bool:
    """Notify the project owner that the external VDR upload + analysis is complete."""
    if not settings.resend_api_key or not settings.email_from:
        logger.warning("Resend not configured; skipping VDR completion email to %s", to_email)
        return False

    try:
        import resend  # type: ignore[import-untyped]
    except ImportError:
        logger.error("resend package not installed")
        return False

    resend.api_key = settings.resend_api_key
    from_addr = _normalize_resend_from(settings.email_from)
    if not from_addr:
        return False

    html = f"""
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f8f9fa;margin:0;padding:20px">
<div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <div style="text-align:center;margin-bottom:32px">
    <span style="font-size:28px;font-weight:700;letter-spacing:-1px;color:#0f172a">D<span style="color:#64748b">-Done</span></span>
  </div>
  <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a">הדוח מוכן</h2>
  <p style="color:#475569;line-height:1.6;margin:0 0 24px">
    הצד החיצוני העלה את המסמכים ובדיקת הנאותות לפרויקט <strong>{project_name}</strong> הושלמה.
  </p>
  <div style="text-align:center;margin:32px 0">
    <a href="{project_url}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600">
      צפייה בדוח
    </a>
  </div>
</div>
</body>
</html>
"""

    params: dict = {
        "from": from_addr,
        "to": [to_email],
        "subject": f"הדוח מוכן — {project_name}",
        "html": html,
    }

    try:
        resend.Emails.send(params)
        logger.info("VDR completion notification sent to %s", to_email)
        return True
    except Exception as exc:
        logger.exception("Failed to send VDR completion email: %s", exc)
        return False


def send_report_ready_notification(
    *,
    to_email: str,
    project_name: str,
    project_url: str,
    needs_hitl_review: bool = False,
) -> bool:
    """Notify the project owner that a DD report is ready (optionally with HITL reminder)."""
    if not settings.resend_api_key or not settings.email_from:
        logger.warning("Resend not configured; skipping report-ready email to %s", to_email)
        return False

    try:
        import resend  # type: ignore[import-untyped]
    except ImportError:
        logger.error("resend package not installed")
        return False

    resend.api_key = settings.resend_api_key
    from_addr = _normalize_resend_from(settings.email_from)
    if not from_addr:
        return False

    if needs_hitl_review:
        body_html = (
            f"<p style='color:#475569;line-height:1.6;margin:0 0 12px'>"
            f"The due diligence report for <strong>{project_name}</strong> is ready.</p>"
            f"<p style='color:#475569;line-height:1.6;margin:0 0 24px'>"
            f"<strong>Action required:</strong> please log in and review the tenant signature table "
            f"to approve or correct the signing status before the report is finalized.</p>"
        )
        subject = f"Action required — review signatures: {project_name}"
    else:
        body_html = (
            f"<p style='color:#475569;line-height:1.6;margin:0 0 24px'>"
            f"The due diligence report for <strong>{project_name}</strong> is ready. "
            f"Click below to view it.</p>"
        )
        subject = f"Report ready — {project_name}"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f8f9fa;margin:0;padding:20px">
<div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <div style="text-align:center;margin-bottom:32px">
    <span style="font-size:28px;font-weight:700;letter-spacing:-1px;color:#0f172a">D<span style="color:#64748b">-Done</span></span>
  </div>
  {body_html}
  <div style="text-align:center;margin:32px 0">
    <a href="{project_url}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600">
      View Report
    </a>
  </div>
</div>
</body>
</html>"""

    params: dict = {
        "from": from_addr,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }

    try:
        resend.Emails.send(params)
        logger.info("Report-ready notification sent to %s (hitl=%s)", to_email, needs_hitl_review)
        return True
    except Exception as exc:
        logger.exception("Failed to send report-ready email: %s", exc)
        return False


def send_invite_email(
    *,
    to_email: str,
    invite_url: str,
    org_name: str | None,
    role: str,
) -> bool:
    """Send invitation email. Returns True if sent or skipped (no API key in dev)."""
    if not settings.resend_api_key or not settings.email_from:
        logger.warning(
            "Resend not configured (RESEND_API_KEY / EMAIL_FROM); skipping invite email to %s",
            to_email,
        )
        return False

    try:
        import resend  # type: ignore[import-untyped]
    except ImportError:
        logger.error("resend package not installed")
        return False

    resend.api_key = settings.resend_api_key

    from_addr = _normalize_resend_from(settings.email_from)
    if not from_addr:
        logger.warning("EMAIL_FROM is empty after normalization; skipping invite email to %s", to_email)
        return False

    html = (
        _load_invite_template()
        .replace("{invite_url}", invite_url)
        .replace("{org_name}", org_name or "D-Done")
        .replace("{role}", role)
    )

    params: dict = {
        "from": from_addr,
        "to": [to_email],
        "subject": f"הזמנה ל-D-Done{f' — {org_name}' if org_name else ''}",
        "html": html,
    }

    try:
        resend.Emails.send(params)
        logger.info("Invite email queued for %s", to_email)
        return True
    except Exception as exc:
        logger.exception("Failed to send invite email: %s", exc)
        return False
