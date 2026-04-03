"""Public invite preview (POST body — avoids logging raw tokens in query strings)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.core.constants import (
    INVITATION_ACCEPTED,
    INVITATION_REVOKED,
    INVITE_REASON_ALREADY_USED,
    INVITE_REASON_EXPIRED,
    INVITE_REASON_INVALID,
    INVITE_REASON_REVOKED,
    ROLE_MEMBER,
    invite_token_hash,
)
from app.db.session import get_db
from app.db.models import Invitation, Organization

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invites", tags=["invites"])


class InvitePreviewBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    token: str = Field(min_length=1)


class InvitePreviewOk(BaseModel):
    """Preview payload (camelCase keys for frontend)."""

    valid: bool = True
    orgName: str | None = None
    emailHint: str | None = None
    inviteeEmail: str | None = None
    role: str | None = None


class InvitePreviewFail(BaseModel):
    valid: bool = False
    reason: str


@router.post("/preview")
def invite_preview(
    body: InvitePreviewBody,
    db: Session = Depends(get_db),
):
    """Validate an invite token and return org + masked email hint (no auth)."""
    h = invite_token_hash(body.token)
    inv = db.query(Invitation).filter(Invitation.token_hash == h).first()
    now = datetime.now(timezone.utc)

    if not inv:
        return InvitePreviewFail(valid=False, reason=INVITE_REASON_INVALID)

    if inv.revoked or inv.status == INVITATION_REVOKED:
        return InvitePreviewFail(valid=False, reason=INVITE_REASON_REVOKED)

    if inv.expires_at and inv.expires_at < now:
        return InvitePreviewFail(valid=False, reason=INVITE_REASON_EXPIRED)

    if inv.accepted_at or inv.status == INVITATION_ACCEPTED:
        return InvitePreviewFail(valid=False, reason=INVITE_REASON_ALREADY_USED)

    org_name = None
    if inv.org_id:
        org = db.query(Organization).filter(Organization.id == inv.org_id).first()
        if org:
            org_name = org.name

    email = inv.email or ""
    email_hint = _mask_email(email)

    return InvitePreviewOk(
        orgName=org_name,
        emailHint=email_hint,
        inviteeEmail=email.strip().lower() if email else None,
        role=inv.role or ROLE_MEMBER,
    )


def _mask_email(email: str) -> str:
    email = email.strip().lower()
    if "@" not in email:
        return "***"
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        masked = f"{local[0]}***" if local else "***"
    else:
        masked = f"{local[:2]}***"
    return f"{masked}@{domain}"
