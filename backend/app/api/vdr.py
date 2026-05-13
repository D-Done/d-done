"""VDR (Virtual Data Room) external-party upload endpoints.

Flow
----
1. Owner calls POST /vdr/requests with project details + external party email.
   Backend creates the project, generates a secure token, sends invite email.
2. External party follows email link → GET /vdr/public/{token} (minimal info).
3. External party uploads files via POST /vdr/public/{token}/upload/initiate
   and POST /vdr/public/{token}/upload/complete (same GCS resumable flow as
   regular uploads, no auth needed).
4. External party calls POST /vdr/public/{token}/submit when done.
   Backend triggers background DD analysis and emails the owner when done.

Security
--------
- Public endpoints are token-gated only (no session cookie / Descope).
- Public endpoints NEVER return project data beyond a display name.
- Token is a 32-byte random secret (hex = 64 chars), stored as SHA-256 hash.
- Tokens expire after 72 hours by default.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_approved_user
from app.core.authorization import DEFAULT_ORGANIZATION_ID
from app.core.config import settings
from app.db.models import DDCheck, File, Project, ProjectMembership, VdrRequest
from app.db.session import AsyncSessionLocal, get_async_db, get_db
from app.schemas.project_create import ProjectCreateBrainRequest
from app.services.email import send_vdr_completion_notification, send_vdr_upload_invitation
from app.services.gcs import create_resumable_session

logger = logging.getLogger(__name__)

router = APIRouter(tags=["vdr"])

_VDR_TOKEN_EXPIRE_HOURS = 72


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Request / Response models ────────────────────────────────────────────────


class VdrCreateRequest(BaseModel):
    """Owner creates a VDR invite: project details + external party email."""

    invited_email: str = Field(..., description="External party email")
    transaction_type: str = Field(..., description="סוג העסקה")
    project_name: str = Field(..., min_length=2, max_length=200)
    client_name: str | None = Field(None, max_length=200)
    role: str | None = Field(None, max_length=100)
    counterparty_name: str | None = Field(None, max_length=200)
    description: str | None = Field(None, max_length=5000)


class VdrCreateResponse(BaseModel):
    vdr_request_id: str
    project_id: str
    invited_email: str
    status: str
    expires_at: str
    email_sent: bool


class VdrPublicInfoResponse(BaseModel):
    """Minimal project info shown to the external party."""
    project_name: str
    status: str  # pending | uploaded | expired


class VdrUploadInitiateRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)
    content_type: str = Field(default="application/pdf")
    file_size: int | None = Field(default=None, ge=0)
    folder: str | None = Field(default=None, max_length=255)


class VdrUploadInitiateResponse(BaseModel):
    upload_url: str | None
    file_id: str
    gcs_uri: str
    max_size_bytes: int
    already_exists: bool = False


class VdrUploadCompleteRequest(BaseModel):
    file_id: str
    file_size_bytes: int = Field(ge=0)


class VdrUploadCompleteResponse(BaseModel):
    file_id: str
    upload_status: str


# ── Helper: resolve & validate a VDR token ───────────────────────────────────


def _get_active_vdr(db: Session, token: str) -> VdrRequest:
    """Resolve a raw token to an active VdrRequest (sync version)."""
    token_hash = _hash_token(token)
    vdr = db.query(VdrRequest).filter(VdrRequest.token_hash == token_hash).first()
    if not vdr:
        raise HTTPException(status_code=404, detail="Invalid or expired upload link")
    if vdr.status in ("expired", "revoked", "done"):
        raise HTTPException(status_code=410, detail="This upload link has expired")
    if vdr.expires_at < datetime.now(timezone.utc):
        vdr.status = "expired"
        db.commit()
        raise HTTPException(status_code=410, detail="This upload link has expired")
    return vdr


async def _get_active_vdr_async(db: AsyncSession, token: str) -> VdrRequest:
    """Resolve a raw token to an active VdrRequest (async version)."""
    token_hash = _hash_token(token)
    result = await db.execute(
        select(VdrRequest).where(VdrRequest.token_hash == token_hash)
    )
    vdr = result.scalar_one_or_none()
    if not vdr:
        raise HTTPException(status_code=404, detail="Invalid or expired upload link")
    if vdr.status in ("expired", "revoked", "done"):
        raise HTTPException(status_code=410, detail="This upload link has expired")
    if vdr.expires_at < datetime.now(timezone.utc):
        vdr.status = "expired"
        await db.commit()
        raise HTTPException(status_code=410, detail="This upload link has expired")
    return vdr


# ── Authenticated: owner creates a VDR request ───────────────────────────────


@router.post("/api/v1/vdr/requests", response_model=VdrCreateResponse)
def create_vdr_request(
    body: VdrCreateRequest,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Owner creates a project and sends an upload invitation to an external party."""
    # Build project from the same schema the regular flow uses
    project_schema = ProjectCreateBrainRequest(
        transaction_type=body.transaction_type,
        project_name=body.project_name,
        client_name=body.client_name,
        role=body.role,
        counterparty_name=body.counterparty_name,
        description=body.description,
    )
    title, description = project_schema.to_title_description()
    transaction_type = project_schema.to_db_transaction_type()
    transaction_metadata = project_schema.to_db_transaction_metadata()

    project = Project(
        owner_id=user.id,
        organization_id=user.organization_id or DEFAULT_ORGANIZATION_ID,
        title=title,
        description=description,
        transaction_type=transaction_type,
        transaction_metadata=transaction_metadata,
        status="pending",
    )
    db.add(project)
    db.flush()

    membership = ProjectMembership(project_id=project.id, user_id=user.id, role="owner")
    db.add(membership)

    # Generate a secure upload token
    raw_token = secrets.token_hex(32)
    token_hash = _hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=_VDR_TOKEN_EXPIRE_HOURS)

    vdr_req = VdrRequest(
        project_id=project.id,
        invited_by_id=user.id,
        invited_email=body.invited_email,
        token_hash=token_hash,
        status="pending",
        expires_at=expires_at,
    )
    db.add(vdr_req)
    db.commit()
    db.refresh(vdr_req)

    logger.info(
        "VDR request created: vdr_id=%s project=%s invited=%s owner=%s",
        vdr_req.id, project.id, body.invited_email, user.email,
    )

    upload_url = f"{settings.frontend_base_url.rstrip('/')}/vdr/{raw_token}"
    email_sent = send_vdr_upload_invitation(
        to_email=body.invited_email,
        upload_url=upload_url,
        project_name=body.project_name,
        inviter_name=user.name or user.email,
        expires_hours=_VDR_TOKEN_EXPIRE_HOURS,
    )

    return VdrCreateResponse(
        vdr_request_id=str(vdr_req.id),
        project_id=str(project.id),
        invited_email=body.invited_email,
        status="pending",
        expires_at=expires_at.isoformat(),
        email_sent=email_sent,
    )


# ── Public: external party endpoints (token-gated, no auth) ──────────────────


@router.get("/api/v1/vdr/public/{token}", response_model=VdrPublicInfoResponse)
def get_vdr_public_info(token: str, db: Session = Depends(get_db)):
    """Return minimal info needed to render the external upload page."""
    vdr = _get_active_vdr(db, token)
    project = db.query(Project).filter(Project.id == vdr.project_id).first()
    project_name = project.title if project else "פרויקט"
    return VdrPublicInfoResponse(project_name=project_name, status=vdr.status)


@router.post("/api/v1/vdr/public/{token}/upload/initiate", response_model=VdrUploadInitiateResponse)
def vdr_initiate_upload(
    token: str,
    body: VdrUploadInitiateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """External party initiates a GCS resumable upload session."""
    vdr = _get_active_vdr(db, token)
    project_id = str(vdr.project_id)

    # Validate content type
    if body.content_type not in settings.allowed_content_types:
        raise HTTPException(status_code=400, detail=f"Content type not allowed: {body.content_type}")

    if body.file_size is not None and body.file_size > settings.max_upload_size_bytes:
        max_mb = settings.max_upload_size_bytes / (1024 * 1024)
        raise HTTPException(status_code=400, detail=f"File exceeds maximum size of {max_mb:.0f} MiB")

    # Deduplication check
    if body.file_size is not None and body.file_size > 0:
        existing = (
            db.query(File)
            .filter(
                File.project_id == vdr.project_id,
                File.original_name == body.filename,
                File.file_size_bytes == body.file_size,
                File.upload_status == "uploaded",
            )
            .first()
        )
        if existing:
            return VdrUploadInitiateResponse(
                upload_url=None,
                file_id=str(existing.id),
                gcs_uri=existing.gcs_uri,
                max_size_bytes=settings.max_upload_size_bytes,
                already_exists=True,
            )

    # Determine origin for GCS CORS
    origin: str | None = settings.gcs_upload_origin.rstrip("/") or None
    if not origin:
        raw_origin = (request.headers.get("origin") or "").rstrip("/")
        allowed_origins = [o.rstrip("/") for o in (settings.cors_origins or []) if o]
        if raw_origin and raw_origin in allowed_origins:
            origin = raw_origin
        if not origin and allowed_origins:
            origin = allowed_origins[0]

    session_uri, gcs_uri = create_resumable_session(
        project_id=project_id,
        original_filename=body.filename,
        content_type=body.content_type,
        origin=origin,
        folder=body.folder,
    )

    file_record = File(
        project_id=vdr.project_id,
        original_name=body.filename,
        gcs_uri=gcs_uri,
        content_type=body.content_type,
        doc_type="other",
        file_size_bytes=body.file_size,
        upload_status="pending",
        uploaded_by_id=None,  # external party — no user account
    )
    db.add(file_record)
    db.commit()
    db.refresh(file_record)

    return VdrUploadInitiateResponse(
        upload_url=session_uri,
        file_id=str(file_record.id),
        gcs_uri=gcs_uri,
        max_size_bytes=settings.max_upload_size_bytes,
        already_exists=False,
    )


@router.post("/api/v1/vdr/public/{token}/upload/complete", response_model=VdrUploadCompleteResponse)
def vdr_complete_upload(
    token: str,
    body: VdrUploadCompleteRequest,
    db: Session = Depends(get_db),
):
    """Mark a file as fully uploaded after the external party's PUT to GCS succeeds."""
    _get_active_vdr(db, token)

    try:
        file_uuid = UUID(body.file_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file_id")

    file_record = db.query(File).filter(File.id == file_uuid).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    file_record.upload_status = "uploaded"
    file_record.file_size_bytes = body.file_size_bytes
    db.commit()

    return VdrUploadCompleteResponse(file_id=str(file_record.id), upload_status="uploaded")


@router.post("/api/v1/vdr/public/{token}/submit")
async def vdr_submit(
    token: str,
    db: AsyncSession = Depends(get_async_db),
):
    """External party signals they are done uploading.

    Triggers background DD analysis and emails the owner when done.
    The external party receives a plain acknowledgement — no project data.
    """
    vdr = await _get_active_vdr_async(db, token)

    # Verify at least one file was uploaded
    result = await db.execute(
        select(File).where(
            File.project_id == vdr.project_id,
            File.upload_status == "uploaded",
        )
    )
    uploaded_files = list(result.scalars().all())
    if not uploaded_files:
        raise HTTPException(status_code=400, detail="No files uploaded yet")

    # Check for an existing in-progress analysis
    result = await db.execute(
        select(DDCheck).where(
            DDCheck.project_id == vdr.project_id,
            DDCheck.status.in_(["pending", "processing"]),
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Analysis already in progress")

    # Fetch project details for the analysis
    result = await db.execute(select(Project).where(Project.id == vdr.project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Create DD check and update statuses
    dd_check = DDCheck(
        project_id=vdr.project_id,
        status="processing",
        started_at=datetime.now(timezone.utc),
    )
    db.add(dd_check)
    project.status = "processing"
    vdr.status = "uploaded"
    vdr.uploaded_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(dd_check)

    check_id = dd_check.id
    project_id = vdr.project_id
    transaction_type = project.transaction_type or "real_estate_finance"
    transaction_metadata = project.transaction_metadata or {}
    project_title = project.title

    # Resolve owner email (for completion notification)
    from app.db.models import User as UserModel
    owner_result = await db.execute(
        select(UserModel).where(UserModel.id == vdr.invited_by_id)
    )
    owner = owner_result.scalar_one_or_none()
    owner_email = owner.email if owner else None

    logger.info(
        "VDR submit: launching background analysis check_id=%s project=%s files=%d",
        check_id, project_id, len(uploaded_files),
    )

    asyncio.create_task(
        _run_vdr_analysis(
            check_id=check_id,
            project_id=project_id,
            uploaded_files=uploaded_files,
            transaction_type=transaction_type,
            transaction_metadata=transaction_metadata,
            owner_email=owner_email,
            project_title=project_title,
        )
    )

    return {"status": "submitted", "message": "המסמכים התקבלו. הניתוח יחל בקרוב."}


# ── Background analysis with owner notification ───────────────────────────────


async def _run_vdr_analysis(
    *,
    check_id: UUID,
    project_id: UUID,
    uploaded_files: list,
    transaction_type: str,
    transaction_metadata: dict,
    owner_email: str | None,
    project_title: str,
) -> None:
    """Wraps the standard analysis task and sends a completion email to the owner."""
    from app.api.analysis import _run_analysis_task

    await _run_analysis_task(
        check_id=check_id,
        project_id=project_id,
        uploaded_files=uploaded_files,
        transaction_type=transaction_type,
        transaction_metadata=transaction_metadata,
        user_email=owner_email or "vdr-system",
    )

    if owner_email:
        project_url = (
            f"{settings.frontend_base_url.rstrip('/')}/transactions/{project_id}"
        )
        send_vdr_completion_notification(
            to_email=owner_email,
            project_name=project_title,
            project_url=project_url,
        )
