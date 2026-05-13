"""Completeness checklist for Real Estate Finance DD projects.

Routes
------
GET    /api/v1/projects/{id}/checklist           — list items
POST   /api/v1/projects/{id}/checklist/generate  — AI-generate from latest report
POST   /api/v1/projects/{id}/checklist/items     — add a manual item
PATCH  /api/v1/projects/{id}/checklist/{item_id} — toggle complete / edit
DELETE /api/v1/projects/{id}/checklist/{item_id} — delete item
GET    /api/v1/projects/{id}/checklist/export    — download as Word (.docx)
POST   /api/v1/projects/{id}/checklist/share     — create share link + send email

Public (token-gated, no auth cookie):
GET    /checklist/public/{token}                 — view checklist
POST   /checklist/public/{token}/upload          — upload file for a checklist item
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response as FastAPIResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_approved_user
from app.core.authorization import require_project_access
from app.db.models import ChecklistItem, ChecklistShare, DDCheck, File as FileModel, Project
from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["checklist"])

_SHARE_EXPIRE_DAYS = 30


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Schemas ───────────────────────────────────────────────────────────────────

class ChecklistItemOut(BaseModel):
    id: str
    category: str
    title: str
    description: str | None
    is_completed: bool
    completed_at: str | None
    completed_by: str | None
    sort_order: int
    created_at: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm(cls, item: ChecklistItem) -> "ChecklistItemOut":
        return cls(
            id=str(item.id),
            category=item.category,
            title=item.title,
            description=item.description,
            is_completed=item.is_completed,
            completed_at=item.completed_at.isoformat() if item.completed_at else None,
            completed_by=item.completed_by,
            sort_order=item.sort_order,
            created_at=item.created_at.isoformat(),
        )


class ChecklistItemPatch(BaseModel):
    is_completed: bool | None = None
    title: str | None = Field(None, max_length=500)
    description: str | None = Field(None, max_length=2000)
    category: str | None = None


class ChecklistItemCreate(BaseModel):
    category: str = Field(default="other")
    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = Field(None, max_length=2000)


class ShareRequest(BaseModel):
    invited_email: str
    message: str | None = Field(None, max_length=1000)


class ShareResponse(BaseModel):
    share_url: str
    invited_email: str
    expires_at: str
    email_sent: bool


# ── Auth helpers ──────────────────────────────────────────────────────────────

def _get_share(token_raw: str, db: Session) -> ChecklistShare:
    token_hash = _hash_token(token_raw)
    share = db.query(ChecklistShare).filter(
        ChecklistShare.token_hash == token_hash,
        ChecklistShare.is_active == True,
        ChecklistShare.expires_at > _utcnow(),
    ).first()
    if not share:
        raise HTTPException(status_code=404, detail="הקישור לא קיים או פג תוקפו")
    return share


# ── Owner endpoints ───────────────────────────────────────────────────────────

@router.get("/api/v1/projects/{project_id}/checklist", response_model=list[ChecklistItemOut])
def list_checklist(
    project_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    require_project_access(db, user.id, project_id)
    items = (
        db.query(ChecklistItem)
        .filter(ChecklistItem.project_id == project_id)
        .order_by(ChecklistItem.sort_order.asc(), ChecklistItem.created_at.asc())
        .all()
    )
    return [ChecklistItemOut.from_orm(i) for i in items]


@router.post("/api/v1/projects/{project_id}/checklist/generate", response_model=list[ChecklistItemOut])
def generate_checklist(
    project_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """AI-generate checklist items from the latest completed DD report.

    Keeps existing completed items; replaces uncompleted ones.
    """
    require_project_access(db, user.id, project_id)

    # Get latest completed finance DD check
    dd_check = (
        db.query(DDCheck)
        .filter(
            DDCheck.project_id == project_id,
            DDCheck.status == "completed",
        )
        .order_by(DDCheck.completed_at.desc())
        .first()
    )
    if not dd_check or not dd_check.report:
        raise HTTPException(status_code=400, detail="אין דוח DD מוכן לפרויקט זה")

    report_dict = dd_check.report
    if "tenant_table" not in report_dict:
        raise HTTPException(
            status_code=400,
            detail="רשימת ההשלמות זמינה רק לפרויקטי מימון נדל״ן",
        )

    from app.agents.schemas import RealEstateFinanceDDReport
    from app.services.checklist_generator import generate_checklist_items

    try:
        report = RealEstateFinanceDDReport.model_validate(report_dict)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"שגיאה בקריאת הדוח: {exc}") from exc

    # Run generation in thread (Gemini call is blocking)
    new_items = asyncio.get_event_loop().run_in_executor(
        None, generate_checklist_items, report
    )
    # run_in_executor returns a coroutine-like; since this is a sync route use asyncio.run
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor() as pool:
        future = pool.submit(generate_checklist_items, report)
        new_items_list = future.result(timeout=120)

    # Delete uncompleted items for this project
    db.query(ChecklistItem).filter(
        ChecklistItem.project_id == project_id,
        ChecklistItem.is_completed == False,
    ).delete(synchronize_session=False)

    # Insert new items
    created = []
    for item_data in new_items_list:
        item = ChecklistItem(
            project_id=project_id,
            check_id=dd_check.id,
            category=item_data.get("category", "other"),
            title=item_data.get("title", "")[:500],
            description=(item_data.get("description") or "")[:2000] or None,
            sort_order=item_data.get("sort_order", 0),
        )
        db.add(item)
        created.append(item)

    db.commit()
    for item in created:
        db.refresh(item)

    # Return all items (including previously-completed ones)
    all_items = (
        db.query(ChecklistItem)
        .filter(ChecklistItem.project_id == project_id)
        .order_by(ChecklistItem.sort_order.asc(), ChecklistItem.created_at.asc())
        .all()
    )
    return [ChecklistItemOut.from_orm(i) for i in all_items]


@router.post("/api/v1/projects/{project_id}/checklist/items", response_model=ChecklistItemOut, status_code=201)
def add_item(
    project_id: UUID,
    body: ChecklistItemCreate,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    require_project_access(db, user.id, project_id)
    max_order = (
        db.query(ChecklistItem)
        .filter(ChecklistItem.project_id == project_id)
        .count()
    )
    item = ChecklistItem(
        project_id=project_id,
        category=body.category,
        title=body.title,
        description=body.description,
        sort_order=max_order,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return ChecklistItemOut.from_orm(item)


@router.patch("/api/v1/projects/{project_id}/checklist/{item_id}", response_model=ChecklistItemOut)
def update_item(
    project_id: UUID,
    item_id: UUID,
    body: ChecklistItemPatch,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    require_project_access(db, user.id, project_id)
    item = db.query(ChecklistItem).filter(
        ChecklistItem.id == item_id,
        ChecklistItem.project_id == project_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="פריט לא נמצא")

    if body.is_completed is not None:
        item.is_completed = body.is_completed
        if body.is_completed:
            item.completed_at = _utcnow()
            item.completed_by = user.email
        else:
            item.completed_at = None
            item.completed_by = None
    if body.title is not None:
        item.title = body.title
    if body.description is not None:
        item.description = body.description
    if body.category is not None:
        item.category = body.category

    db.commit()
    db.refresh(item)
    return ChecklistItemOut.from_orm(item)


@router.delete("/api/v1/projects/{project_id}/checklist/{item_id}", status_code=204)
def delete_item(
    project_id: UUID,
    item_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    require_project_access(db, user.id, project_id)
    item = db.query(ChecklistItem).filter(
        ChecklistItem.id == item_id,
        ChecklistItem.project_id == project_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="פריט לא נמצא")
    db.delete(item)
    db.commit()


@router.get("/api/v1/projects/{project_id}/checklist/export")
def export_checklist_word(
    project_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Export the checklist as a Word (.docx) file."""
    from urllib.parse import quote
    from app.services.checklist_word import generate_checklist_docx

    project, _ = require_project_access(db, user.id, project_id)
    items = (
        db.query(ChecklistItem)
        .filter(ChecklistItem.project_id == project_id)
        .order_by(ChecklistItem.sort_order.asc(), ChecklistItem.created_at.asc())
        .all()
    )

    docx_bytes = generate_checklist_docx(items, project.title or "")
    safe_title = (
        "".join(c for c in (project.title or "project") if c.isalnum() or c in " -_")
        .strip()[:60]
        or "checklist"
    )
    filename = f"{safe_title}_רשימת_השלמות.docx"
    encoded = quote(filename, safe="")
    return FastAPIResponse(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )


@router.post("/api/v1/projects/{project_id}/checklist/share", response_model=ShareResponse)
def share_checklist(
    project_id: UUID,
    body: ShareRequest,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Create a share token and send email invitation to an external party."""
    from app.core.config import settings as app_settings
    from app.services.email import send_checklist_invitation

    project, _ = require_project_access(db, user.id, project_id)

    raw_token = secrets.token_hex(32)
    token_hash = _hash_token(raw_token)
    expires_at = _utcnow() + timedelta(days=_SHARE_EXPIRE_DAYS)

    share = ChecklistShare(
        project_id=project_id,
        token_hash=token_hash,
        invited_email=body.invited_email,
        message=body.message,
        expires_at=expires_at,
        created_by_email=user.email,
    )
    db.add(share)
    db.commit()

    frontend_base = (getattr(app_settings, "frontend_base_url", None) or "https://app.d-done.com").rstrip("/")
    share_url = f"{frontend_base}/checklist/{raw_token}"

    email_sent = send_checklist_invitation(
        to_email=body.invited_email,
        checklist_url=share_url,
        project_name=project.title or "פרויקט",
        inviter_name=user.name if hasattr(user, "name") else user.email,
        message=body.message,
        expires_days=_SHARE_EXPIRE_DAYS,
    )

    return ShareResponse(
        share_url=share_url,
        invited_email=body.invited_email,
        expires_at=expires_at.isoformat(),
        email_sent=email_sent,
    )


# ── Public (token-gated) endpoints ────────────────────────────────────────────

class PublicChecklistResponse(BaseModel):
    project_name: str
    items: list[ChecklistItemOut]


@router.get("/checklist/public/{token}", response_model=PublicChecklistResponse)
def public_get_checklist(token: str, db: Session = Depends(get_db)):
    share = _get_share(token, db)
    project = db.query(Project).filter(Project.id == share.project_id).first()
    items = (
        db.query(ChecklistItem)
        .filter(ChecklistItem.project_id == share.project_id)
        .order_by(ChecklistItem.sort_order.asc(), ChecklistItem.created_at.asc())
        .all()
    )
    return PublicChecklistResponse(
        project_name=project.title if project else "פרויקט",
        items=[ChecklistItemOut.from_orm(i) for i in items],
    )


@router.post("/checklist/public/{token}/upload", status_code=201)
async def public_upload_file(
    token: str,
    item_id: str = Form(...),
    file: UploadFile = File(...),
    uploader_name: str = Form(default=""),
    db: Session = Depends(get_db),
):
    """External party uploads a file for a specific checklist item.

    The file is stored in GCS under the project's folder and
    the corresponding checklist item is marked completed.
    """
    share = _get_share(token, db)

    # Validate checklist item belongs to this project
    try:
        item_uuid = UUID(item_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="item_id לא תקין")

    checklist_item = db.query(ChecklistItem).filter(
        ChecklistItem.id == item_uuid,
        ChecklistItem.project_id == share.project_id,
    ).first()
    if not checklist_item:
        raise HTTPException(status_code=404, detail="פריט לא נמצא")

    ct = file.content_type or "application/octet-stream"
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="הקובץ ריק")

    # Upload to GCS
    from app.core.config import settings as app_settings2

    def _do_upload() -> str | None:
        try:
            from google.cloud import storage as gcs_storage
            client = gcs_storage.Client()
            bucket_obj = client.bucket(app_settings2.gcs_bucket_name)
            safe_name = (file.filename or "upload").replace("/", "_")
            blob_path = f"projects/{share.project_id}/checklist_uploads/{uuid4()}_{safe_name}"
            blob = bucket_obj.blob(blob_path)
            blob.upload_from_string(data, content_type=ct)
            return f"gs://{app_settings2.gcs_bucket_name}/{blob_path}"
        except Exception as exc:
            logger.error("GCS upload failed for checklist item: %s", exc, exc_info=True)
            return None

    gcs_uri = await asyncio.to_thread(_do_upload)
    if gcs_uri:
        file_record = FileModel(
            project_id=share.project_id,
            original_name=file.filename or "upload",
            content_type=ct,
            file_size_bytes=len(data),
            gcs_uri=gcs_uri,
            upload_status="uploaded",
        )
        db.add(file_record)

    # Mark item completed
    checklist_item.is_completed = True
    checklist_item.completed_at = _utcnow()
    checklist_item.completed_by = uploader_name or share.invited_email

    db.commit()
    return {"status": "ok", "item_id": item_id}
