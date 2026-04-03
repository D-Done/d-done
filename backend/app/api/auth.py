"""Session and profile endpoints — Descope token exchange + HttpOnly cookie sessions."""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.authorization import DEFAULT_ORGANIZATION_ID
from app.core.auth import (
    CurrentUser,
    get_current_user,
    session_cookie_name,
    ensure_default_organization,
)
from app.core.config import settings
from app.core.constants import (
    APPROVAL_APPROVED,
    APPROVAL_PENDING,
    DESCOPE_CLAIM_AMR,
    DESCOPE_CLAIM_LOGIN_IDS,
    DESCOPE_CLAIM_OAUTH_PROVIDER,
    DESCOPE_CLAIM_PROVIDER,
    DESCOPE_GENERIC_PROVIDERS,
    ERROR_ACCOUNT_DEACTIVATED,
    ERROR_ACCOUNT_DELETED,
    ERROR_EMAIL_MISSING,
    ERROR_INVITATION_ALREADY_USED,
    ERROR_INVITATION_EXPIRED,
    ERROR_INVITATION_INVALID,
    ERROR_INVITATION_REQUIRED,
    ERROR_INVITATION_REVOKED,
    HTTP_HEADER_USER_AGENT,
    INVITATION_ACCEPTED,
    INVITATION_REVOKED,
    PROVIDER_GOOGLE,
    PROVIDER_MICROSOFT,
    ROLE_ADMIN,
    ROLE_MEMBER,
    SESSION_COOKIE_SECURE,
    SESSION_COOKIE_SAMESITE,
    VALID_PROVIDER_HINTS,
    invite_token_hash,
)
from app.core.descope_client import validate_descope_session
from app.db.session import get_db
from app.db.models import User, Invitation, AppSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_JWT_LOG_EXCLUDED_CLAIMS = {"iss", "iat", "exp", "aud"}


def _infer_provider(claims: dict) -> str | None:
    """Infer the OAuth provider from Descope JWT claims.

    Descope encodes the provider in several places; we check them
    in order of specificity.
    """
    for key in (DESCOPE_CLAIM_OAUTH_PROVIDER, DESCOPE_CLAIM_PROVIDER):
        v = claims.get(key)
        if v and str(v).lower() not in DESCOPE_GENERIC_PROVIDERS:
            return str(v).lower()

    amr = claims.get(DESCOPE_CLAIM_AMR)
    if isinstance(amr, list):
        for method in amr:
            m = str(method).lower()
            if PROVIDER_GOOGLE in m:
                return PROVIDER_GOOGLE
            if PROVIDER_MICROSOFT in m or "azure" in m:
                return PROVIDER_MICROSOFT

    login_ids = claims.get(DESCOPE_CLAIM_LOGIN_IDS) or claims.get("login_ids") or []
    if isinstance(login_ids, list):
        for lid in login_ids:
            lid_lower = str(lid).lower()
            if lid_lower.startswith(PROVIDER_GOOGLE):
                return PROVIDER_GOOGLE
            if lid_lower.startswith(PROVIDER_MICROSOFT):
                return PROVIDER_MICROSOFT

    sub = str(claims.get("sub", ""))
    if sub:
        sub_lower = sub.lower()
        if PROVIDER_GOOGLE in sub_lower:
            return PROVIDER_GOOGLE
        if PROVIDER_MICROSOFT in sub_lower:
            return PROVIDER_MICROSOFT

    if isinstance(amr, list) and amr:
        return str(amr[0]).lower()
    return None


def _set_session_cookie(
    response: Response, request: Request, session_token: str
) -> None:
    name = session_cookie_name(request)
    max_age = settings.auth_session_expire_seconds
    secure = name == SESSION_COOKIE_SECURE
    response.set_cookie(
        key=name,
        value=session_token,
        max_age=max_age,
        httponly=True,
        secure=secure,
        samesite=SESSION_COOKIE_SAMESITE,
        path="/",
    )


def _clear_session_cookie(response: Response, request: Request) -> None:
    name = session_cookie_name(request)
    secure = name == SESSION_COOKIE_SECURE
    response.delete_cookie(key=name, path="/", secure=secure)


class SessionCreateBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    descope_token: str = Field(validation_alias="descopeToken")
    invite_token: str | None = Field(default=None, validation_alias="inviteToken")
    provider_hint: str | None = Field(default=None, validation_alias="providerHint")


class MeResponse(BaseModel):
    id: str
    email: str
    name: str | None
    picture: str | None
    provider: str | None = None
    approval_status: str
    is_admin: bool
    team: str | None = None
    has_completed_onboarding: bool = False
    is_deleted: bool = False


def _me_from_user(db_user: User) -> MeResponse:
    return MeResponse(
        id=str(db_user.id),
        email=db_user.email,
        name=db_user.name,
        picture=db_user.picture,
        provider=db_user.provider,
        approval_status=db_user.approval_status or APPROVAL_PENDING,
        is_admin=bool(db_user.is_admin),
        team=db_user.team,
        has_completed_onboarding=bool(db_user.has_completed_onboarding),
        is_deleted=bool(getattr(db_user, "is_deleted", False)),
    )


@router.post("/session", response_model=MeResponse)
def create_session(
    request: Request,
    response: Response,
    body: SessionCreateBody,
    db: Session = Depends(get_db),
):
    """Exchange a Descope session JWT for an HttpOnly backend session cookie.

    When ``inviteToken`` is present, possessing the secret token is sufficient
    proof of authorization.  Descope may return a different primary email than
    the invited address (e.g. when Google and Microsoft are linked under one
    Descope user), so we do **not** enforce an email-match — the token is the
    secret, not the email.
    """
    claims = validate_descope_session(body.descope_token)
    safe_keys = {k: v for k, v in claims.items() if k not in _JWT_LOG_EXCLUDED_CLAIMS}
    logger.info("Descope claims: %s", safe_keys)

    descope_sub = str(claims.get("sub", ""))
    email = (claims.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail=ERROR_EMAIL_MISSING)

    name = claims.get("name")
    picture = claims.get("picture")
    provider = _infer_provider(claims)
    if not provider or provider in DESCOPE_GENERIC_PROVIDERS:
        hint = (body.provider_hint or "").strip().lower()
        if hint in VALID_PROVIDER_HINTS:
            provider = hint

    invite_token = (body.invite_token or "").strip() or None
    inv: Invitation | None = None

    if invite_token:
        h = invite_token_hash(invite_token)
        inv = db.query(Invitation).filter(Invitation.token_hash == h).first()
        now_check = datetime.now(timezone.utc)
        if not inv:
            raise HTTPException(status_code=400, detail=ERROR_INVITATION_INVALID)
        if inv.revoked or inv.status == INVITATION_REVOKED:
            raise HTTPException(status_code=400, detail=ERROR_INVITATION_REVOKED)
        if inv.expires_at and inv.expires_at < now_check:
            raise HTTPException(status_code=400, detail=ERROR_INVITATION_EXPIRED)
        if inv.accepted_at or inv.status == INVITATION_ACCEPTED:
            raise HTTPException(status_code=400, detail=ERROR_INVITATION_ALREADY_USED)
        if inv.email.strip().lower() != email:
            logger.info(
                "Invite email %s differs from Descope email %s (linked accounts); "
                "accepting based on token.",
                inv.email, email,
            )

    db_user = (
        db.query(User).filter(User.descope_user_id == descope_sub).first()
        if descope_sub
        else None
    )
    if not db_user:
        db_user = db.query(User).filter(User.email == email).first()
        if db_user and descope_sub and not db_user.descope_user_id:
            db_user.descope_user_id = descope_sub

    now = datetime.now(timezone.utc)

    if db_user:
        if not db_user.is_active:
            raise HTTPException(status_code=403, detail=ERROR_ACCOUNT_DEACTIVATED)
        if getattr(db_user, "is_deleted", False):
            raise HTTPException(status_code=403, detail=ERROR_ACCOUNT_DELETED)
        if inv:
            inv.accepted_at = now
            inv.status = INVITATION_ACCEPTED
        if name:
            db_user.name = name or db_user.name
        if picture:
            db_user.picture = picture
        if provider:
            db_user.provider = provider
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            logger.exception("DB integrity error while updating user during login")
            raise HTTPException(
                status_code=409,
                detail="Account conflict. Please contact support.",
            )
        db.refresh(db_user)
    else:
        if not inv:
            raise HTTPException(status_code=403, detail=ERROR_INVITATION_REQUIRED)

        ensure_default_organization(db)
        org_id = inv.org_id or DEFAULT_ORGANIZATION_ID
        is_org_admin = (inv.role or ROLE_MEMBER).lower() == ROLE_ADMIN

        admin_emails = [
            e.strip().lower()
            for e in settings.auth_admin_emails.split(",")
            if e.strip()
        ]
        is_bootstrap_admin = email in admin_emails

        db_user = User(
            id=uuid4(),
            organization_id=org_id,
            descope_user_id=descope_sub,
            email=email,
            name=name or (email.split("@")[0] if email else None),
            picture=picture,
            provider=provider,
            approval_status=APPROVAL_APPROVED,
            is_admin=is_org_admin or is_bootstrap_admin,
            is_active=True,
        )
        db.add(db_user)
        inv.accepted_at = now
        inv.status = INVITATION_ACCEPTED
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            logger.exception("DB integrity error while creating user from invite")
            raise HTTPException(
                status_code=409,
                detail="Account conflict. Please contact support.",
            )
        db.refresh(db_user)
        logger.info("Created user from invite: %s org=%s", email, org_id)

    session_token = secrets.token_urlsafe(64)
    exp = datetime.now(timezone.utc) + timedelta(
        seconds=settings.auth_session_expire_seconds
    )
    sess = AppSession(
        id=uuid4(),
        token=session_token,
        user_id=db_user.id,
        descope_user_id=descope_sub,
        ip_address=request.client.host if request.client else None,
        user_agent=(request.headers.get(HTTP_HEADER_USER_AGENT) or "")[:512] or None,
        expires_at=exp,
    )
    db.add(sess)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        logger.exception("DB integrity error while creating session")
        raise HTTPException(
            status_code=500,
            detail="Failed to create session.",
        )

    _set_session_cookie(response, request, session_token)
    return _me_from_user(db_user)


@router.delete("/session", status_code=204)
def delete_session(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Logout: invalidate server session and clear cookie."""
    name = session_cookie_name(request)
    token = request.cookies.get(name)
    if token:
        db.query(AppSession).filter(AppSession.token == token).delete()
        db.commit()
    _clear_session_cookie(response, request)
    response.status_code = 204
    return response


@router.get("/me", response_model=MeResponse)
def auth_me(user: CurrentUser = Depends(get_current_user)):
    """Return the current authenticated user's profile."""
    return MeResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        picture=user.picture,
        provider=user.provider,
        approval_status=user.approval_status,
        is_admin=user.is_admin,
        team=user.team,
        has_completed_onboarding=user.has_completed_onboarding,
    )


class ProfileUpdate(BaseModel):
    name: str | None = None
    team: str | None = None


@router.patch("/me/profile", response_model=MeResponse)
def update_profile(
    body: ProfileUpdate,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the current user's profile (name, team)."""
    db_user = db.query(User).filter(User.id == user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.name is not None:
        db_user.name = body.name.strip()
    if body.team is not None:
        db_user.team = body.team.strip()
    db.commit()
    db.refresh(db_user)
    return _me_from_user(db_user)


@router.post("/me/complete-onboarding", response_model=MeResponse)
def complete_onboarding(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark the current user's onboarding as complete."""
    db_user = db.query(User).filter(User.id == user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    db_user.has_completed_onboarding = True
    db.commit()
    db.refresh(db_user)
    return _me_from_user(db_user)
