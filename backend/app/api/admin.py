"""Admin endpoints for user management (approval, role, activity)."""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.audit import record_audit
from app.core.auth import CurrentUser, ensure_default_organization, get_admin_user
from app.core.authorization import DEFAULT_ORGANIZATION_ID
from app.core.config import settings
from app.core.constants import (
    APPROVAL_APPROVED,
    APPROVAL_PENDING,
    AUDIT_ACTION_USER_DELETE,
    ENTITY_USER,
    INVITATION_PENDING,
    INVITATION_REVOKED,
    ROLE_MEMBER,
    VALID_APPROVAL_STATUSES,
    VALID_INVITE_ROLES,
    invite_token_hash,
)
from app.db.session import get_db
from app.db.models import AppSession, AuditLog, User, Project, DDCheck, Invitation, Organization
from app.services.email import send_invite_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


class UserRow(BaseModel):
    id: str
    email: str
    name: str | None
    picture: str | None
    provider: str | None = None
    organization_id: str | None = None
    organization_name: str | None = None
    approval_status: str  # APPROVAL_PENDING | APPROVAL_APPROVED | APPROVAL_REJECTED
    is_admin: bool
    is_deleted: bool = False
    created_at: str


class UserListResponse(BaseModel):
    users: list[UserRow]
    total: int


class ApprovalUpdate(BaseModel):
    approval_status: str  # one of VALID_APPROVAL_STATUSES


class AdminFlagUpdate(BaseModel):
    is_admin: bool


@router.get("/users", response_model=UserListResponse)
def list_users(
    status: str | None = Query(None, description="Filter by approval_status"),
    admin: CurrentUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """List all users, optionally filtered by approval status."""
    q = db.query(User).options(joinedload(User.organization))
    if status:
        q = q.filter(User.approval_status == status)
    q = q.order_by(User.created_at.desc())
    users = q.all()
    return UserListResponse(
        users=[
            UserRow(
                id=str(u.id),
                email=u.email,
                name=u.name,
                picture=u.picture,
                provider=u.provider,
                organization_id=str(u.organization_id) if u.organization_id else None,
                organization_name=u.organization.name if u.organization else None,
                approval_status=u.approval_status or APPROVAL_PENDING,
                is_admin=bool(u.is_admin),
                is_deleted=bool(getattr(u, "is_deleted", False)),
                created_at=u.created_at.isoformat() if u.created_at else "",
            )
            for u in users
        ],
        total=len(users),
    )


@router.patch("/users/{user_id}/approval", response_model=UserRow)
def update_user_approval(
    user_id: UUID,
    body: ApprovalUpdate,
    admin: CurrentUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Approve or reject a user."""
    if body.approval_status not in VALID_APPROVAL_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(VALID_APPROVAL_STATUSES)}",
        )
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.approval_status = body.approval_status
    db.commit()
    db.refresh(target)
    logger.info("Admin %s set user %s approval to %s", admin.email, target.email, body.approval_status)
    return UserRow(
        id=str(target.id),
        email=target.email,
        name=target.name,
        picture=target.picture,
        provider=target.provider,
        organization_id=str(target.organization_id) if target.organization_id else None,
        organization_name=target.organization.name if target.organization else None,
        approval_status=target.approval_status or APPROVAL_PENDING,
        is_admin=bool(target.is_admin),
        is_deleted=bool(getattr(target, "is_deleted", False)),
        created_at=target.created_at.isoformat() if target.created_at else "",
    )


@router.patch("/users/{user_id}/admin", response_model=UserRow)
def update_user_admin_flag(
    user_id: UUID,
    body: AdminFlagUpdate,
    admin: CurrentUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Grant or revoke admin privileges."""
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id and not body.is_admin:
        raise HTTPException(status_code=400, detail="Cannot remove your own admin status")
    target.is_admin = body.is_admin
    db.commit()
    db.refresh(target)
    logger.info("Admin %s set user %s is_admin=%s", admin.email, target.email, body.is_admin)
    return UserRow(
        id=str(target.id),
        email=target.email,
        name=target.name,
        picture=target.picture,
        provider=target.provider,
        organization_id=str(target.organization_id) if target.organization_id else None,
        organization_name=target.organization.name if target.organization else None,
        approval_status=target.approval_status or APPROVAL_PENDING,
        is_admin=bool(target.is_admin),
        is_deleted=bool(getattr(target, "is_deleted", False)),
        created_at=target.created_at.isoformat() if target.created_at else "",
    )


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: UUID,
    request: Request,
    admin: CurrentUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Soft-delete a user: revoke access, sessions, pending invites; preserve row for attribution."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if getattr(target, "is_deleted", False):
        raise HTTPException(status_code=400, detail="User already deleted")

    now = datetime.now(timezone.utc)
    email_lower = target.email.strip().lower()
    pending_invs = (
        db.query(Invitation)
        .filter(
            Invitation.email == email_lower,
            Invitation.status == INVITATION_PENDING,
        )
        .all()
    )
    for inv in pending_invs:
        inv.revoked = True
        inv.revoked_at = now
        inv.status = INVITATION_REVOKED

    db.query(AppSession).filter(AppSession.user_id == target.id).delete(synchronize_session=False)

    target.is_deleted = True
    target.is_active = False
    target.deleted_at = now
    target.deleted_by_id = admin.id

    record_audit(
        db,
        actor=admin,
        action=AUDIT_ACTION_USER_DELETE,
        entity_type=ENTITY_USER,
        entity_id=target.id,
        entity_name=target.email,
        meta={"target_email": target.email},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    logger.info("Admin %s soft-deleted user %s", admin.email, target.email)
    return None


class AuditLogRow(BaseModel):
    id: str
    actor_id: str | None
    actor_email_snapshot: str
    actor_name_snapshot: str | None
    action: str
    entity_type: str
    entity_id: str | None
    entity_name: str | None
    meta: dict | None
    ip_address: str | None
    created_at: str


class AuditListResponse(BaseModel):
    items: list[AuditLogRow]
    total: int


@router.get("/audit", response_model=AuditListResponse)
def list_audit_log(
    entity_type: str | None = Query(None),
    entity_id: UUID | None = Query(None),
    actor_id: UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: CurrentUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Paginated append-only audit log (admin only)."""
    q = db.query(AuditLog)
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type.strip().lower())
    if entity_id is not None:
        q = q.filter(AuditLog.entity_id == entity_id)
    if actor_id is not None:
        q = q.filter(AuditLog.actor_id == actor_id)
    total = q.count()
    rows = (
        q.order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return AuditListResponse(
        items=[
            AuditLogRow(
                id=str(r.id),
                actor_id=str(r.actor_id) if r.actor_id else None,
                actor_email_snapshot=r.actor_email_snapshot,
                actor_name_snapshot=r.actor_name_snapshot,
                action=r.action,
                entity_type=r.entity_type,
                entity_id=str(r.entity_id) if r.entity_id else None,
                entity_name=r.entity_name,
                meta=r.meta if isinstance(r.meta, dict) else None,
                ip_address=r.ip_address,
                created_at=r.created_at.isoformat() if r.created_at else "",
            )
            for r in rows
        ],
        total=total,
    )


# ---------------------------------------------------------------------------
# User activity & AI expense tracking
# ---------------------------------------------------------------------------


class UserActivity(BaseModel):
    user_id: str
    email: str
    name: str | None
    project_count: int
    dd_check_count: int
    total_prompt_tokens: int
    total_completion_tokens: int
    total_tokens: int
    last_active: str | None


class ActivityResponse(BaseModel):
    users: list[UserActivity]
    totals: dict


@router.get("/activity", response_model=ActivityResponse)
def get_user_activity(
    admin: CurrentUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Per-user activity and AI token usage for expense tracking."""
    users = db.query(User).all()
    result = []
    grand_prompt = 0
    grand_completion = 0
    grand_total = 0
    grand_checks = 0

    for u in users:
        project_count = db.query(func.count(Project.id)).filter(Project.owner_id == u.id).scalar() or 0
        checks = (
            db.query(DDCheck)
            .join(Project, DDCheck.project_id == Project.id)
            .filter(Project.owner_id == u.id)
            .all()
        )
        dd_count = len(checks)
        prompt_tokens = sum(c.prompt_tokens or 0 for c in checks)
        completion_tokens = sum(c.completion_tokens or 0 for c in checks)
        total_tokens = sum(c.total_tokens or 0 for c in checks)
        last_check = max((c.completed_at or c.created_at for c in checks), default=None)

        grand_prompt += prompt_tokens
        grand_completion += completion_tokens
        grand_total += total_tokens
        grand_checks += dd_count

        result.append(UserActivity(
            user_id=str(u.id),
            email=u.email,
            name=u.name,
            project_count=project_count,
            dd_check_count=dd_count,
            total_prompt_tokens=prompt_tokens,
            total_completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            last_active=last_check.isoformat() if last_check else None,
        ))

    result.sort(key=lambda x: x.total_tokens, reverse=True)

    return ActivityResponse(
        users=result,
        totals={
            "total_prompt_tokens": grand_prompt,
            "total_completion_tokens": grand_completion,
            "total_tokens": grand_total,
            "total_dd_checks": grand_checks,
            "total_users": len(users),
        },
    )


# ---------------------------------------------------------------------------
# Email invitations (hashed tokens, Resend)
# ---------------------------------------------------------------------------


class CreateInvitationBody(BaseModel):
    email: str
    role: str = "member"


class InvitationRow(BaseModel):
    id: str
    email: str
    invited_by_email: str | None
    status: str
    created_at: str
    expires_at: str | None = None
    revoked: bool = False


class InvitationCreateResponse(BaseModel):
    invitation: InvitationRow
    invite_url: str
    email_sent: bool = Field(
        description="True if Resend accepted the message; invite row exists even when False.",
    )


@router.post("/invitations", response_model=InvitationCreateResponse)
def create_invitation(
    body: CreateInvitationBody,
    admin: CurrentUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Create a hashed invite, send email, return one-time invite URL."""
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user and existing_user.approval_status == APPROVAL_APPROVED:
        raise HTTPException(status_code=400, detail="User already exists")

    ensure_default_organization(db)
    org_id = DEFAULT_ORGANIZATION_ID
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=400, detail="Organization not found")

    role = (body.role or ROLE_MEMBER).lower()
    if role not in VALID_INVITE_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"role must be one of: {', '.join(VALID_INVITE_ROLES)}",
        )

    pending = (
        db.query(Invitation)
        .filter(
            Invitation.email == email,
            Invitation.status == INVITATION_PENDING,
            Invitation.revoked == False,  # noqa: E712
        )
        .first()
    )
    if pending and pending.expires_at and pending.expires_at > datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invitation already pending for this email")

    raw_token = secrets.token_urlsafe(32)
    token_hash = invite_token_hash(raw_token)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=48)

    inv = Invitation(
        id=uuid4(),
        email=email,
        org_id=org_id,
        role=role,
        token_hash=token_hash,
        invited_by_id=admin.id,
        status=INVITATION_PENDING,
        revoked=False,
        expires_at=expires,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)

    base = settings.frontend_base_url.rstrip("/")
    invite_url = f"{base}/invite?token={raw_token}"

    email_sent = send_invite_email(
        to_email=email,
        invite_url=invite_url,
        org_name=org.name,
        role=role,
    )

    logger.info("Admin %s created invitation for %s", admin.email, email)

    row = InvitationRow(
        id=str(inv.id),
        email=inv.email,
        invited_by_email=admin.email,
        status=inv.status,
        created_at=inv.created_at.isoformat() if inv.created_at else "",
        expires_at=inv.expires_at.isoformat() if inv.expires_at else None,
        revoked=bool(inv.revoked),
    )
    return InvitationCreateResponse(invitation=row, invite_url=invite_url, email_sent=email_sent)


@router.get("/invitations", response_model=list[InvitationRow])
def list_invitations(
    admin: CurrentUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """List all invitations."""
    invs = db.query(Invitation).order_by(Invitation.created_at.desc()).all()
    rows: list[InvitationRow] = []
    for inv in invs:
        inviter = db.query(User).filter(User.id == inv.invited_by_id).first() if inv.invited_by_id else None
        rows.append(InvitationRow(
            id=str(inv.id),
            email=inv.email,
            invited_by_email=inviter.email if inviter else None,
            status=inv.status,
            created_at=inv.created_at.isoformat() if inv.created_at else "",
            expires_at=inv.expires_at.isoformat() if inv.expires_at else None,
            revoked=bool(inv.revoked),
        ))
    return rows


@router.delete("/invitations/{invitation_id}", status_code=204)
def revoke_invitation(
    invitation_id: UUID,
    admin: CurrentUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Revoke a pending invitation."""
    inv = db.query(Invitation).filter(Invitation.id == invitation_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")
    inv.revoked = True
    inv.revoked_at = datetime.now(timezone.utc)
    inv.status = INVITATION_REVOKED
    db.commit()
    logger.info("Admin %s revoked invitation %s", admin.email, invitation_id)
    return None
