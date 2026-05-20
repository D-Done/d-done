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
<html lang="he">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f1f5f9;margin:0;padding:40px 16px">
  <div style="max-width:540px;margin:0 auto">

    <!-- Logo -->
    <div style="text-align:center;margin-bottom:24px">
      <span dir="ltr" style="display:inline-block;font-size:20px;font-weight:700;letter-spacing:-0.5px;color:#0f172a">D<span style="color:#94a3b8">-Done</span></span>
    </div>

    <!-- Card -->
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.07)">

      <!-- Top stripe -->
      <div style="height:3px;background:#0f172a"></div>

      <!-- Body -->
      <div style="padding:40px;direction:rtl;text-align:right">

        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.8px;color:#94a3b8;text-transform:uppercase">VDR</p>
        <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.3px">הזמנה להעלאת מסמכים</h1>

        <p style="margin:0 0 6px;font-size:15px;color:#475569;line-height:1.7">
          <strong style="color:#0f172a">{inviter_display}</strong> מזמין/ת אותך להעלות מסמכי VDR עבור הפרויקט:
        </p>

        <!-- Project name pill -->
        <div style="display:inline-block;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:8px 14px;margin-bottom:28px">
          <span style="font-size:15px;font-weight:600;color:#0f172a">{project_name}</span>
        </div>

        <!-- CTA -->
        <div style="text-align:center;margin:8px 0 28px">
          <a href="{upload_url}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:14px 44px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:0.1px">
            העלאת מסמכים
          </a>
        </div>

        <!-- Expiry -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:11px 16px;text-align:center">
          <span style="font-size:13px;color:#64748b">הקישור תקף ל-<strong style="color:#0f172a">{expires_hours} שעות</strong></span>
        </div>

      </div>

      <!-- Footer -->
      <div style="padding:16px 40px;background:#f8fafc;border-top:1px solid #f1f5f9;text-align:center">
        <p style="margin:0;font-size:12px;color:#94a3b8">אם לא ביקשת הזמנה זו, ניתן להתעלם ממייל זה.</p>
      </div>
    </div>

    <!-- Bottom -->
    <p style="text-align:center;margin:20px 0 0;font-size:11px;color:#94a3b8" dir="ltr">© 2026 D-Done · Secure Document Transfer</p>

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


def send_checklist_invitation(
    *,
    to_email: str,
    checklist_url: str,
    project_name: str,
    inviter_name: str | None,
    message: str | None = None,
    expires_days: int = 30,
) -> bool:
    """Send a checklist upload invitation to an external party."""
    if not settings.resend_api_key or not settings.email_from:
        logger.warning("Resend not configured; skipping checklist invite to %s", to_email)
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
    message_block = (
        f'<p style="color:#475569;line-height:1.6;margin:0 0 16px;'
        f'background:#f8fafc;border-right:3px solid #0f172a;padding:12px 16px;border-radius:4px">'
        f'{message}</p>'
    ) if message else ""

    html = f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;background:#f8f9fa;margin:0;padding:20px">
<div style="max-width:540px;margin:auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <div style="text-align:center;margin-bottom:32px">
    <span style="font-size:28px;font-weight:700;letter-spacing:-1px;color:#0f172a">D<span style="color:#64748b">-Done</span></span>
  </div>
  <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a">רשימת השלמות — {project_name}</h2>
  <p style="color:#475569;line-height:1.6;margin:0 0 16px">
    {inviter_display} שלח/ה לך רשימת מסמכים ופעולות שיש להשלים עבור הפרויקט <strong>{project_name}</strong>.
  </p>
  {message_block}
  <p style="color:#475569;line-height:1.6;margin:0 0 24px">
    ניתן לצפות ברשימה ולהעלות את המסמכים הנדרשים דרך הקישור הבא (תקף ל-{expires_days} ימים):
  </p>
  <div style="text-align:center;margin:32px 0">
    <a href="{checklist_url}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600">
      צפייה ברשימת ההשלמות
    </a>
  </div>
  <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center">
    אם לא ביקשת גישה זו, ניתן להתעלם ממייל זה.
  </p>
</div>
</body>
</html>"""

    try:
        resend.Emails.send({
            "from": from_addr,
            "to": [to_email],
            "subject": f"רשימת השלמות — {project_name}",
            "html": html,
        })
        logger.info("Checklist invitation sent to %s", to_email)
        return True
    except Exception as exc:
        logger.exception("Failed to send checklist invite: %s", exc)
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
