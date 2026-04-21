"""Projects endpoints — CRUD for due-diligence projects.

A project is the top-level container for a set of uploaded documents that
will be analysed together.  Each project gets a UUID that is also used as
the GCS path prefix: ``gs://bucket/<project_id>/<filename>``.

All endpoints require authentication and scope data to the current user.
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.auth import CurrentUser, get_approved_user
from app.core.constants import (
    AUDIT_ACTION_FILE_VIEW,
    AUDIT_ACTION_PROJECT_CREATE,
    AUDIT_ACTION_PROJECT_DELETE,
    AUDIT_ACTION_PROJECT_MEMBER_ADD,
    AUDIT_ACTION_PROJECT_MEMBER_REMOVE,
    ENTITY_FILE,
    ENTITY_PROJECT,
)
from app.core.authorization import (
    DEFAULT_ORGANIZATION_ID,
    project_ids_accessible_by_user,
    require_project_access,
    require_project_owner,
)
from app.db.session import get_db
from app.db.models import Project, File, DDCheck, ProjectMembership, User
from app.services.gcs import generate_signed_view_url
from app.schemas.project_create import (
    ProjectCreateLegacyRequest,
    ProjectCreateRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])


def _extract_block_parcel_for_project(db: Session, project_id: UUID) -> tuple[str | None, str | None]:
    """Extract block (גוש) and parcel (חלקה) from the latest DD check report or hitl_data."""
    check = (
        db.query(DDCheck)
        .filter(DDCheck.project_id == project_id)
        .order_by(DDCheck.created_at.desc())
        .first()
    )
    if not check:
        return None, None
    # Prefer report compound_details, then hitl_data
    if check.report and isinstance(check.report, dict):
        cd = check.report.get("compound_details")
        if isinstance(cd, dict):
            gush = cd.get("gush")
            helka = cd.get("helka")
            if gush or helka:
                return (str(gush) if gush else None), (str(helka) if helka else None)
    if check.hitl_data and isinstance(check.hitl_data, dict):
        block = check.hitl_data.get("block")
        parcel = check.hitl_data.get("parcel")
        if block or parcel:
            return (str(block) if block else None), (str(parcel) if parcel else None)
    return None, None


# ---- Request / Response models ----


class FileResponse(BaseModel):
    id: str
    project_id: str
    original_name: str
    gcs_uri: str
    doc_type: str
    folder: str | None = None
    file_size_bytes: int | None
    upload_status: str
    created_at: str
    uploaded_by_id: str | None = None
    uploaded_by_name: str | None = None
    uploaded_by_email: str | None = None
    uploaded_by_is_deleted: bool = False

    model_config = {"from_attributes": True}


class DDCheckResponse(BaseModel):
    id: str
    project_id: str
    status: str
    error_message: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class ProjectResponse(BaseModel):
    id: str
    title: str
    description: str | None = None
    status: str
    pipeline_stage: str | None = None
    transaction_type: str = "real_estate_finance"
    transaction_metadata: dict | None = None
    created_at: str
    updated_at: str
    files: list[FileResponse] = []
    dd_checks: list[DDCheckResponse] = []
    current_user_role: str | None = None  # "owner" | "viewer" — only on GET single project
    owner_name: str | None = None
    owner_email: str | None = None
    owner_is_deleted: bool = False

    model_config = {"from_attributes": True}


class ProjectMemberBrief(BaseModel):
    email: str
    name: str | None
    is_deleted: bool = False

class ProjectListItem(BaseModel):
    id: str
    title: str
    status: str
    created_at: str
    file_count: int
    members: list[ProjectMemberBrief] = []
    block: str | None = None
    parcel: str | None = None

    model_config = {"from_attributes": True}


class DashboardStatsResponse(BaseModel):
    total_projects: int
    completed_projects: int
    dd_checks_in_progress: int
    dd_checks_completed: int
    documents_scanned: int


class FileViewUrlResponse(BaseModel):
    url: str
    expires_in_seconds: int


class ProjectMemberResponse(BaseModel):
    user_id: str
    email: str
    name: str | None = None
    role: str  # owner | viewer
    is_deleted: bool = False


class AddProjectMemberRequest(BaseModel):
    email: str


# ---- Endpoints ----


@router.get("/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Return counts for the dashboard: projects by status, DD checks, documents."""
    project_ids_subq = project_ids_accessible_by_user(db, user.id)
    base = db.query(Project).filter(Project.id.in_(project_ids_subq))
    total_projects = base.count()
    completed_projects = base.filter(Project.status == "completed").count()
    documents_scanned = (
        db.query(File)
        .join(Project, File.project_id == Project.id)
        .filter(Project.id.in_(project_ids_subq))
        .count()
    )
    dd_in_progress = (
        db.query(DDCheck)
        .filter(
            DDCheck.project_id.in_(project_ids_subq),
            DDCheck.status.in_(["pending", "processing"]),
        )
        .count()
    )
    dd_completed = (
        db.query(DDCheck)
        .filter(
            DDCheck.project_id.in_(project_ids_subq),
            DDCheck.status == "completed",
        )
        .count()
    )
    return DashboardStatsResponse(
        total_projects=total_projects,
        completed_projects=completed_projects,
        dd_checks_in_progress=dd_in_progress,
        dd_checks_completed=dd_completed,
        documents_scanned=documents_scanned,
    )


@router.post("/", response_model=ProjectResponse, status_code=201)
def create_project(
    body: ProjectCreateRequest,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Create a new due-diligence project.

    Returns the project with its UUID which the frontend uses as the
    ``project_id`` for subsequent upload calls.
    """
    transaction_type = "real_estate_finance"
    transaction_metadata: dict | None = None

    if isinstance(body, ProjectCreateLegacyRequest):
        title = body.title
        description = body.description
    else:
        title, description = body.to_title_description()
        transaction_type = body.to_db_transaction_type()
        transaction_metadata = body.to_db_transaction_metadata()

    project = Project(
        owner_id=user.id,
        organization_id=user.organization_id or DEFAULT_ORGANIZATION_ID,
        title=title,
        description=description,
        transaction_type=transaction_type,
        transaction_metadata=transaction_metadata,
    )
    db.add(project)
    db.flush()
    membership = ProjectMembership(project_id=project.id, user_id=user.id, role="owner")
    db.add(membership)
    record_audit(
        db,
        actor=user,
        action=AUDIT_ACTION_PROJECT_CREATE,
        entity_type=ENTITY_PROJECT,
        entity_id=project.id,
        entity_name=project.title,
    )
    db.commit()
    db.refresh(project)

    logger.info("Created project %s: %s (user=%s)", project.id, project.title, user.email)

    return _project_to_response(project)


@router.get("/", response_model=list[ProjectListItem])
def list_projects(
    q: str | None = Query(
        default=None,
        description="חיפוש חופשי בכותרת/תיאור הפרויקט",
        max_length=200,
    ),
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """List all projects the current user can access (owner or member)."""
    project_ids_subq = project_ids_accessible_by_user(db, user.id)
    query = db.query(Project).filter(Project.id.in_(project_ids_subq))
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(or_(Project.title.ilike(term), Project.description.ilike(term)))

    projects = query.order_by(Project.created_at.desc()).all()
    result = []
    for p in projects:
        members = []
        if p.owner:
            members.append(
                ProjectMemberBrief(
                    email=p.owner.email,
                    name=p.owner.name,
                    is_deleted=bool(getattr(p.owner, "is_deleted", False)),
                )
            )
        for m in p.memberships:
            if m.user and m.user.email != (p.owner.email if p.owner else ""):
                members.append(
                    ProjectMemberBrief(
                        email=m.user.email,
                        name=m.user.name,
                        is_deleted=bool(getattr(m.user, "is_deleted", False)),
                    )
                )

        block, parcel = _extract_block_parcel_for_project(db, p.id)
        result.append(ProjectListItem(
            id=str(p.id),
            title=p.title,
            status=p.status,
            created_at=p.created_at.isoformat(),
            file_count=len(p.files),
            members=members,
            block=block,
            parcel=parcel,
        ))
    return result


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Get a single project with its files and DD checks."""
    project, role = require_project_access(db, user.id, project_id)
    return _project_to_response(project, current_user_role=role)


@router.get("/{project_id}/files", response_model=list[FileResponse])
def list_project_files(
    project_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """List all files belonging to a project."""
    project, _ = require_project_access(db, user.id, project_id)
    return [_file_to_response(f) for f in project.files]


@router.get("/{project_id}/files/{file_id}/view-url", response_model=FileViewUrlResponse)
def get_file_view_url(
    project_id: UUID,
    file_id: UUID,
    request: Request,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Return a short-lived signed URL to view a file inline in the browser."""
    project, _ = require_project_access(db, user.id, project_id)
    file = (
        db.query(File)
        .filter(File.id == file_id, File.project_id == project.id)
        .first()
    )
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    if file.upload_status != "uploaded":
        raise HTTPException(status_code=409, detail="File is not uploaded yet")

    try:
        url, exp = generate_signed_view_url(
            gcs_uri=file.gcs_uri,
            filename=file.original_name,
            content_type=file.content_type or "application/pdf",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to generate view URL: {exc}")

    record_audit(
        db,
        actor=user,
        action=AUDIT_ACTION_FILE_VIEW,
        entity_type=ENTITY_FILE,
        entity_id=file.id,
        entity_name=file.original_name,
        meta={"project_id": str(project_id)},
        ip=request.client.host if request.client else None,
    )
    db.commit()

    return FileViewUrlResponse(url=url, expires_in_seconds=exp)


@router.get("/{project_id}/status")
def get_project_status(
    project_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Get just the status of a project (used for polling)."""
    project, _ = require_project_access(db, user.id, project_id)
    return {"status": project.status}


@router.get("/{project_id}/members", response_model=list[ProjectMemberResponse])
def list_project_members(
    project_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """List all members of a project (owner + memberships)."""
    project, _ = require_project_access(db, user.id, project_id)
    members: list[ProjectMemberResponse] = []
    owner = db.query(User).filter(User.id == project.owner_id).first()
    if owner:
        members.append(
            ProjectMemberResponse(
                user_id=str(owner.id),
                email=owner.email,
                name=owner.name,
                role="owner",
                is_deleted=bool(getattr(owner, "is_deleted", False)),
            )
        )
    for m in project.memberships:
        if m.user_id == project.owner_id:
            continue
        u = db.query(User).filter(User.id == m.user_id).first()
        if u:
            members.append(
                ProjectMemberResponse(
                    user_id=str(u.id),
                    email=u.email,
                    name=u.name,
                    role=m.role,
                    is_deleted=bool(getattr(u, "is_deleted", False)),
                )
            )
    return members


@router.post("/{project_id}/members", response_model=ProjectMemberResponse, status_code=201)
def add_project_member(
    project_id: UUID,
    body: AddProjectMemberRequest,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Add a user to the project by email (viewer). Owner only. User must belong to the same organization."""
    project = require_project_owner(db, user.id, project_id)
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    invitee = db.query(User).filter(User.email == email).first()
    if not invitee or getattr(invitee, "is_deleted", False):
        raise HTTPException(
            status_code=404,
            detail="No user found with this email. They must sign in once to join the platform.",
        )
    # Only users in the same organization can be added
    project_org = project.organization_id or DEFAULT_ORGANIZATION_ID
    invitee_org = invitee.organization_id or DEFAULT_ORGANIZATION_ID
    if project_org != invitee_org:
        raise HTTPException(
            status_code=403,
            detail="This user is not in your organization. You can only add members from your organization.",
        )
    existing = (
        db.query(ProjectMembership)
        .filter(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == invitee.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="User is already a member of this project")
    if invitee.id == user.id:
        raise HTTPException(status_code=400, detail="You are already the project owner")
    membership = ProjectMembership(
        project_id=project_id,
        user_id=invitee.id,
        role="viewer",
    )
    db.add(membership)
    record_audit(
        db,
        actor=user,
        action=AUDIT_ACTION_PROJECT_MEMBER_ADD,
        entity_type=ENTITY_PROJECT,
        entity_id=project_id,
        entity_name=project.title,
        meta={"added_email": invitee.email, "role": "viewer"},
    )
    db.commit()
    db.refresh(membership)
    return ProjectMemberResponse(
        user_id=str(invitee.id),
        email=invitee.email,
        name=invitee.name,
        role="viewer",
        is_deleted=bool(getattr(invitee, "is_deleted", False)),
    )


@router.delete("/{project_id}/members/{member_user_id}", status_code=204)
def remove_project_member(
    project_id: UUID,
    member_user_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Remove a member from the project. Owner only. Cannot remove the project creator."""
    project = require_project_owner(db, user.id, project_id)
    if member_user_id == project.owner_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot remove the project creator. Transfer ownership first.",
        )
    membership = (
        db.query(ProjectMembership)
        .filter(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == member_user_id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Member not found")
    removed = db.query(User).filter(User.id == member_user_id).first()
    db.delete(membership)
    record_audit(
        db,
        actor=user,
        action=AUDIT_ACTION_PROJECT_MEMBER_REMOVE,
        entity_type=ENTITY_PROJECT,
        entity_id=project_id,
        entity_name=project.title,
        meta={
            "removed_user_id": str(member_user_id),
            "removed_email": removed.email if removed else None,
        },
    )
    db.commit()
    logger.info(
        "Removed user %s from project %s (by %s)",
        member_user_id,
        project_id,
        user.email,
    )


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Delete a project: removes GCS files first, then cascades DB rows. Owner only."""
    from app.services.gcs import delete_project_folder

    project = require_project_owner(db, user.id, project_id)
    title = project.title

    try:
        delete_project_folder(str(project_id))
    except Exception as exc:
        logger.warning(
            "GCS cleanup failed for project %s (proceeding with DB delete): %s",
            project_id,
            exc,
        )

    record_audit(
        db,
        actor=user,
        action=AUDIT_ACTION_PROJECT_DELETE,
        entity_type=ENTITY_PROJECT,
        entity_id=project_id,
        entity_name=title,
    )
    db.delete(project)
    db.commit()
    logger.info("Deleted project %s (user=%s)", project_id, user.email)


# ---- Helpers ----


def _project_to_response(project: Project, current_user_role: str | None = None) -> ProjectResponse:
    owner = project.owner
    return ProjectResponse(
        id=str(project.id),
        title=project.title,
        description=project.description,
        status=project.status,
        pipeline_stage=getattr(project, "pipeline_stage", None),
        transaction_type=getattr(project, "transaction_type", None)
        or "real_estate_finance",
        transaction_metadata=getattr(project, "transaction_metadata", None),
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat(),
        files=[_file_to_response(f) for f in project.files],
        dd_checks=[_dd_check_to_response(c) for c in project.dd_checks],
        current_user_role=current_user_role,
        owner_name=owner.name if owner else None,
        owner_email=owner.email if owner else None,
        owner_is_deleted=bool(getattr(owner, "is_deleted", False)) if owner else False,
    )


def _folder_from_gcs_uri(gcs_uri: str, project_id: str) -> str | None:
    """Parse the logical folder name from a GCS URI.

    URI format: gs://bucket/{project_id}/{folder}/{filename}
                gs://bucket/{project_id}/{filename}   (no folder)
    """
    try:
        marker = f"/{project_id}/"
        idx = gcs_uri.find(marker)
        if idx == -1:
            return None
        rest = gcs_uri[idx + len(marker):]  # e.g. "Agreements/MOU.pdf" or "MOU.pdf"
        parts = rest.split("/")
        return parts[0] if len(parts) >= 2 else None
    except Exception:
        return None


def _file_to_response(f: File) -> FileResponse:
    u = getattr(f, "uploaded_by", None)
    return FileResponse(
        id=str(f.id),
        project_id=str(f.project_id),
        original_name=f.original_name,
        gcs_uri=f.gcs_uri,
        doc_type=f.doc_type,
        folder=_folder_from_gcs_uri(f.gcs_uri, str(f.project_id)),
        file_size_bytes=f.file_size_bytes,
        upload_status=f.upload_status,
        created_at=f.created_at.isoformat(),
        uploaded_by_id=str(f.uploaded_by_id) if f.uploaded_by_id else None,
        uploaded_by_name=u.name if u else None,
        uploaded_by_email=u.email if u else None,
        uploaded_by_is_deleted=bool(getattr(u, "is_deleted", False)) if u else False,
    )


def _dd_check_to_response(c: DDCheck) -> DDCheckResponse:
    return DDCheckResponse(
        id=str(c.id),
        project_id=str(c.project_id),
        status=c.status,
        error_message=c.error_message,
        started_at=c.started_at.isoformat() if c.started_at else None,
        completed_at=c.completed_at.isoformat() if c.completed_at else None,
        created_at=c.created_at.isoformat(),
    )
