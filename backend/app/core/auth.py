"""Authentication dependency for FastAPI.

Uses opaque server-side sessions: the browser sends an HttpOnly cookie;
the backend looks up ``AppSession`` and loads the user.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from uuid import UUID

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.authorization import DEFAULT_ORGANIZATION_ID
from app.core.config import settings
from app.core.constants import (
    APPROVAL_APPROVED,
    DEFAULT_ORGANIZATION_NAME,
    ERROR_ACCOUNT_DEACTIVATED,
    ERROR_ACCOUNT_DELETED,
    ERROR_ACCOUNT_NOT_APPROVED,
    ERROR_ADMIN_REQUIRED,
    ERROR_AUTH_REQUIRED,
    ERROR_INVALID_SESSION,
    ERROR_USER_NOT_FOUND,
    GCP_CLOUD_RUN_ENV_VAR,
    SESSION_COOKIE_DEV,
    SESSION_COOKIE_SECURE,
)
from app.db.session import get_db
from app.db.models import User, AppSession

logger = logging.getLogger(__name__)


def session_cookie_name(request: Request) -> str:
    """``__Host-session`` requires Secure; use ``session`` on plain HTTP (local dev)."""
    if request.url.scheme == "https":
        return SESSION_COOKIE_SECURE
    return SESSION_COOKIE_DEV


class CurrentUser:
    """Lightweight user context from the verified session and DB."""

    def __init__(self, db_user: User):
        self.id: UUID = db_user.id
        self.organization_id: UUID | None = getattr(db_user, "organization_id", None)
        self.google_id: str | None = getattr(db_user, "google_id", None)
        self.descope_user_id: str | None = getattr(db_user, "descope_user_id", None)
        self.provider: str | None = getattr(db_user, "provider", None)
        self.email: str = db_user.email
        self.name: str | None = db_user.name
        self.picture: str | None = db_user.picture
        self.approval_status: str = getattr(db_user, "approval_status", "pending") or "pending"
        self.is_admin: bool = getattr(db_user, "is_admin", False) or False
        self.is_active: bool = getattr(db_user, "is_active", True)
        self.team: str | None = getattr(db_user, "team", None)
        self.has_completed_onboarding: bool = (
            getattr(db_user, "has_completed_onboarding", False) or False
        )
        self.is_deleted: bool = bool(getattr(db_user, "is_deleted", False))


def _auth_disabled_allowed() -> bool:
    """``AUTH_DISABLED`` is ignored in Cloud Run (``K_SERVICE`` set)."""
    if os.environ.get(GCP_CLOUD_RUN_ENV_VAR):
        return False
    return bool(settings.auth_disabled)


def _dev_bypass_user(db: Session) -> User | None:
    """Resolve a user when auth is disabled (local dev only)."""
    if settings.auth_dev_user_email:
        return (
            db.query(User)
            .filter(User.email == settings.auth_dev_user_email.strip().lower())
            .filter(User.is_deleted.is_(False))
            .first()
        )
    return (
        db.query(User)
        .filter(User.is_deleted.is_(False))
        .order_by(User.created_at.asc())
        .first()
    )


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> CurrentUser:
    """FastAPI dependency: verify session cookie and return the current user."""
    if _auth_disabled_allowed():
        db_user = _dev_bypass_user(db)
        if not db_user:
            raise HTTPException(
                status_code=503,
                detail="Auth disabled but no user found. Seed a user or set AUTH_DEV_USER_EMAIL.",
            )
        return CurrentUser(db_user)

    name = session_cookie_name(request)
    token = request.cookies.get(name)
    if not token:
        raise HTTPException(status_code=401, detail=ERROR_AUTH_REQUIRED)

    now = datetime.now(timezone.utc)
    row = (
        db.query(AppSession)
        .filter(AppSession.token == token, AppSession.expires_at > now)
        .first()
    )
    if not row:
        raise HTTPException(status_code=401, detail=ERROR_INVALID_SESSION)

    db_user = db.query(User).filter(User.id == row.user_id).first()
    if not db_user:
        raise HTTPException(status_code=401, detail=ERROR_USER_NOT_FOUND)
    if not getattr(db_user, "is_active", True):
        raise HTTPException(status_code=403, detail=ERROR_ACCOUNT_DEACTIVATED)
    if getattr(db_user, "is_deleted", False):
        raise HTTPException(status_code=403, detail=ERROR_ACCOUNT_DELETED)

    return CurrentUser(db_user)


def get_approved_user(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Dependency: require an authenticated AND approved user. Returns 403 if pending/rejected."""
    if user.approval_status != APPROVAL_APPROVED:
        raise HTTPException(
            status_code=403,
            detail=ERROR_ACCOUNT_NOT_APPROVED.format(status=user.approval_status),
        )
    return user


def get_admin_user(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Dependency: require an authenticated admin user."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail=ERROR_ADMIN_REQUIRED)
    return user


def ensure_default_organization(db: Session) -> None:
    """Ensure the canonical default organization row exists (Arnon)."""
    from app.db.models import Organization

    org = db.query(Organization).filter(Organization.id == DEFAULT_ORGANIZATION_ID).first()
    if not org:
        org = Organization(id=DEFAULT_ORGANIZATION_ID, name=DEFAULT_ORGANIZATION_NAME)
        db.add(org)
        db.commit()
        logger.info("Created default organization %s", DEFAULT_ORGANIZATION_ID)
