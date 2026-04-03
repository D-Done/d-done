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
