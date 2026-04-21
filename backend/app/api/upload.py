"""Upload endpoints — GCS resumable upload flow backed by PostgreSQL.

1.  POST /upload/initiate   → creates a ``files`` row (status=pending) and
                               a GCS resumable session; returns the session URI
2.  (frontend uploads chunks directly to the GCS session URI)
3.  POST /upload/complete   → updates the ``files`` row to ``uploaded`` only
                               when the frontend confirms 200/201 from GCS

All uploads target the **me-west1** (Tel Aviv) region via the GCS service
layer for data-residency compliance.

File naming in GCS: ``gs://<bucket>/<project_id>/<original_filename>``
The original filename is preserved so lawyers can identify documents.
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.config import settings
from app.core.auth import CurrentUser, get_approved_user
from app.core.constants import AUDIT_ACTION_FILE_UPLOAD, ENTITY_FILE
from app.core.authorization import require_project_owner
from app.db.session import get_db
from app.db.models import File
from app.services.gcs import create_resumable_session, verify_gcs_connectivity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/upload", tags=["upload"])


# ---- Request / Response models ----


class UploadInitiateRequest(BaseModel):
    """Request body for initiating a resumable upload."""

    project_id: str = Field(
        description="Project UUID this document belongs to",
        min_length=1,
    )
    filename: str = Field(
        description="Original filename (e.g. 'tabu_extract.pdf')",
        min_length=1,
        max_length=255,
    )
    content_type: str = Field(
        default="application/pdf",
        description="MIME type of the file",
    )
    doc_type: str = Field(
        default="other",
        description="Document type classification",
    )
    file_size: int | None = Field(
        default=None,
        ge=0,
        description="File size in bytes (optional, used for pre-validation)",
    )
    folder: str | None = Field(
        default=None,
        max_length=255,
        description="Optional folder name for UI organisation; used as GCS sub-path prefix",
    )


class UploadInitiateResponse(BaseModel):
    """Response with the session URI the client will PUT chunks to."""

    upload_url: str | None = Field(
        default=None,
        description="GCS session URI — PUT file chunks directly to this URL. Null when already_exists=True.",
    )
    file_id: str = Field(
        description="Database file ID (UUID) — send back in /upload/complete",
    )
    gcs_uri: str = Field(
        description="Full GCS URI: gs://bucket/project_id/filename",
    )
    max_size_bytes: int = Field(
        description="Maximum allowed file size in bytes",
    )
    bucket_location: str = Field(
        description="GCS bucket region (e.g. me-west1)",
    )
    cors_origin: str | None = Field(
        default=None,
        description="Origin passed to GCS for CORS (diagnostic)",
    )
    already_exists: bool = Field(
        default=False,
        description="True when an identical file (same name + size) is already uploaded in this project. No GCS upload needed.",
    )


class UploadCompleteRequest(BaseModel):
    """Notification from the frontend that a file upload finished (200/201 from GCS)."""

    file_id: str = Field(description="File UUID returned from /upload/initiate")
    file_size_bytes: int = Field(ge=0)


class UploadCompleteResponse(BaseModel):
    """Acknowledgement that the file record was updated."""

    file_id: str
    gcs_uri: str
    upload_status: str


class GCSHealthResponse(BaseModel):
    """GCS connectivity health-check result."""

    status: str
    bucket: str | None = None
    location: str | None = None
    detail: str | None = None


# ---- Endpoints ----


@router.post("/initiate", response_model=UploadInitiateResponse)
def initiate_upload(
    body: UploadInitiateRequest,
    request: Request,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Create a GCS resumable upload session and a ``files`` DB row.

    1. Validates content type and optional file size.
    2. Verifies the project exists and belongs to the user.
    3. Creates a ``files`` row with ``upload_status = 'pending'``.
    4. Creates a GCS resumable session at
       ``gs://bucket/<project_id>/<original_filename>``.
    5. Returns the session URI for the frontend to PUT chunks to.
    """
    # --- Validate content type ---
    if body.content_type not in settings.allowed_content_types:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Content type '{body.content_type}' is not allowed. "
                f"Accepted types: {', '.join(settings.allowed_content_types)}"
            ),
        )

    # --- Validate file size (if provided) ---
    if body.file_size is not None and body.file_size > settings.max_upload_size_bytes:
        max_mb = settings.max_upload_size_bytes / (1024 * 1024)
        raise HTTPException(
            status_code=400,
            detail=f"File size ({body.file_size} bytes) exceeds the maximum of {max_mb:.0f} MiB.",
        )

    # --- Verify project exists and user has owner access ---
    try:
        project_uuid = UUID(body.project_id)
    except ValueError:
        raise HTTPException(
            status_code=400, detail="Invalid project_id format (expected UUID)"
        )

    require_project_owner(db, user.id, project_uuid)

    # --- Deduplication: skip if same name + size already uploaded in this project ---
    if body.file_size is not None and body.file_size > 0:
        existing = (
            db.query(File)
            .filter(
                File.project_id == project_uuid,
                File.original_name == body.filename,
                File.file_size_bytes == body.file_size,
                File.upload_status == "uploaded",
            )
            .first()
        )
        if existing:
            logger.info(
                "Duplicate skipped: file_id=%s, name=%s, size=%d, project=%s, user=%s",
                existing.id,
                body.filename,
                body.file_size,
                body.project_id,
                user.email,
            )
            return UploadInitiateResponse(
                upload_url=None,
                file_id=str(existing.id),
                gcs_uri=existing.gcs_uri,
                max_size_bytes=settings.max_upload_size_bytes,
                bucket_location=settings.gcs_location,
                cors_origin=None,
                already_exists=True,
            )

    # --- Create GCS resumable session ---
    try:
        # GCS resumable upload sessions MUST be created with the browser's
        # Origin.  Without it, GCS omits Access-Control-Allow-Origin on every
        # PUT response, causing the browser to block the response (CORS error)
        # even though the file actually uploads.
        #
        # Priority: GCS_UPLOAD_ORIGIN env → request Origin → Referer → first
        # configured CORS origin.
        origin: str | None = settings.gcs_upload_origin.rstrip("/") or None

        if not origin:
            raw_origin = (request.headers.get("origin") or "").rstrip("/")
            allowed_origins = [o.rstrip("/") for o in (settings.cors_origins or []) if o]

            if raw_origin and raw_origin in allowed_origins:
                origin = raw_origin

            if not origin:
                referer = request.headers.get("referer") or ""
                if referer:
                    from urllib.parse import urlparse
                    parsed = urlparse(referer)
                    ref_origin = f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
                    if ref_origin in allowed_origins:
                        origin = ref_origin

            if not origin and allowed_origins:
                origin = next(
                    (o for o in allowed_origins if o.startswith("https://")),
                    allowed_origins[0],
                )

        logger.info(
            "Upload origin resolution: resolved=%r (env=%r, header=%r)",
            origin,
            settings.gcs_upload_origin or "(not set)",
            request.headers.get("origin", "(absent)"),
        )

        session_uri, gcs_uri = create_resumable_session(
            project_id=body.project_id,
            original_filename=body.filename,
            content_type=body.content_type,
            origin=origin,
            folder=body.folder,
        )
    except Exception as exc:
        logger.exception("Failed to create upload session for %s", body.filename)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to create upload session: {exc}",
        )

    # --- Create file record with status=pending ---
    file_record = File(
        project_id=project_uuid,
        original_name=body.filename,
        gcs_uri=gcs_uri,
        content_type=body.content_type,
        doc_type=body.doc_type,
        file_size_bytes=body.file_size,
        upload_status="pending",
        uploaded_by_id=user.id,
    )
    db.add(file_record)
    db.flush()
    record_audit(
        db,
        actor=user,
        action=AUDIT_ACTION_FILE_UPLOAD,
        entity_type=ENTITY_FILE,
        entity_id=file_record.id,
        entity_name=body.filename,
        meta={"project_id": str(project_uuid)},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(file_record)

    logger.info(
        "Initiated upload: file_id=%s, gcs_uri=%s, project=%s, user=%s",
        file_record.id,
        gcs_uri,
        body.project_id,
        user.email,
    )

    return UploadInitiateResponse(
        upload_url=session_uri,
        file_id=str(file_record.id),
        gcs_uri=gcs_uri,
        max_size_bytes=settings.max_upload_size_bytes,
        bucket_location=settings.gcs_location,
        cors_origin=origin,
    )


@router.post("/complete", response_model=UploadCompleteResponse)
def complete_upload(
    body: UploadCompleteRequest,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Mark a file as successfully uploaded.

    Called by the frontend **only** after GCS returns 200 OK or 201 Created,
    confirming the upload is complete.  This updates the ``files`` row to
    ``upload_status = 'uploaded'`` and records the confirmed file size.
    """
    # --- Find the file record ---
    try:
        file_uuid = UUID(body.file_id)
    except ValueError:
        raise HTTPException(
            status_code=400, detail="Invalid file_id format (expected UUID)"
        )

    # Find file and verify user has owner access to the project
    file_record = (
        db.query(File)
        .filter(File.id == file_uuid)
        .first()
    )
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    require_project_owner(db, user.id, file_record.project_id)

    # --- Validate file size ---
    if body.file_size_bytes > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file exceeds the maximum allowed size.",
        )

    # --- Update record only on confirmed upload ---
    file_record.upload_status = "uploaded"
    file_record.file_size_bytes = body.file_size_bytes
    db.commit()
    db.refresh(file_record)

    logger.info(
        "Upload confirmed: file_id=%s, gcs_uri=%s, size=%d, project=%s",
        file_record.id,
        file_record.gcs_uri,
        body.file_size_bytes,
        file_record.project_id,
    )

    return UploadCompleteResponse(
        file_id=str(file_record.id),
        gcs_uri=file_record.gcs_uri,
        upload_status=file_record.upload_status,
    )


@router.get("/health", response_model=GCSHealthResponse)
async def gcs_health():
    """Check GCS connectivity and bucket access in me-west1."""
    result = verify_gcs_connectivity()
    if result["status"] != "ok":
        raise HTTPException(
            status_code=503, detail=result.get("detail", "GCS unavailable")
        )
    return GCSHealthResponse(**result)
