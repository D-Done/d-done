"""Organization-scoped endpoints — list users in the current user's organization."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_, func
from sqlalchemy.orm import Session
from typing import Literal

from app.core.auth import CurrentUser, get_approved_user
from app.core.authorization import DEFAULT_ORGANIZATION_ID
from app.db.session import get_db
from app.db.models import DDCheck, Organization, Project, ProjectMembership, User

router = APIRouter(prefix="/organization", tags=["organization"])


class OrganizationUser(BaseModel):
    id: str
    email: str
    name: str | None


@router.get("/users", response_model=list[OrganizationUser])
def list_organization_users(
    q: str | None = Query(default=None, max_length=200, description="Search by email or name"),
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """List users in the current user's organization (for adding project members).
    Excludes the current user. Optional search filter by email or name.
    """
    org_id = user.organization_id or DEFAULT_ORGANIZATION_ID
    query = db.query(User).filter(User.organization_id == org_id, User.id != user.id)
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(User.email.ilike(term), func.coalesce(User.name, "").ilike(term))
        )
    users = query.order_by(User.email).limit(50).all()
    return [
        OrganizationUser(id=str(u.id), email=u.email, name=u.name)
        for u in users
    ]


class OrgLanguageResponse(BaseModel):
    language: str


class OrgLanguageUpdate(BaseModel):
    language: Literal["he", "en"]


@router.get("/language", response_model=OrgLanguageResponse)
def get_org_language(
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    org_id = user.organization_id or DEFAULT_ORGANIZATION_ID
    org = db.query(Organization).filter(Organization.id == org_id).first()
    return OrgLanguageResponse(language=org.language if org else "he")


@router.patch("/language", response_model=OrgLanguageResponse)
def set_org_language(
    body: OrgLanguageUpdate,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    org_id = user.organization_id or DEFAULT_ORGANIZATION_ID
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org.language = body.language
    db.commit()
    return OrgLanguageResponse(language=org.language)


# ---------------------------------------------------------------------------
# User profile
# ---------------------------------------------------------------------------


class UserProfileResponse(BaseModel):
    user_id: str
    name: str | None
    email: str
    joined_at: str
    shared_projects_count: int
    shared_project_names: list[str]
    total_project_count: int
    own_tokens: int
    member_tokens: int
    total_tokens: int


def _calc_user_token_stats(db: Session, target_user_id) -> tuple[int, int]:
    own = (
        db.query(func.coalesce(func.sum(DDCheck.total_tokens), 0))
        .join(ProjectMembership, ProjectMembership.project_id == DDCheck.project_id)
        .filter(
            ProjectMembership.user_id == target_user_id,
            ProjectMembership.role == "owner",
            DDCheck.status == "completed",
        )
        .scalar()
    )
    member = (
        db.query(func.coalesce(func.sum(DDCheck.total_tokens), 0))
        .join(ProjectMembership, ProjectMembership.project_id == DDCheck.project_id)
        .filter(
            ProjectMembership.user_id == target_user_id,
            ProjectMembership.role == "viewer",
            DDCheck.status == "completed",
        )
        .scalar()
    )
    return int(own or 0), int(member or 0)


@router.get("/users/{user_id}/profile", response_model=UserProfileResponse)
def get_user_profile(
    user_id: str,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Return profile card data for another user in the same organization."""
    import uuid as _uuid

    caller_org_id = user.organization_id or DEFAULT_ORGANIZATION_ID
    try:
        target_uuid = _uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="User not found")

    target = db.query(User).filter(User.id == target_uuid).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if str(target.organization_id or DEFAULT_ORGANIZATION_ID) != str(caller_org_id):
        raise HTTPException(status_code=403, detail="User is not in your organization")

    caller_project_ids = (
        db.query(ProjectMembership.project_id)
        .filter(ProjectMembership.user_id == user.id)
        .subquery()
    )
    shared = (
        db.query(ProjectMembership.project_id)
        .filter(
            ProjectMembership.user_id == target_uuid,
            ProjectMembership.project_id.in_(caller_project_ids),
        )
        .all()
    )
    shared_ids = [r[0] for r in shared]
    shared_names: list[str] = []
    if shared_ids:
        shared_names = [
            p.title
            for p in db.query(Project).filter(Project.id.in_(shared_ids)).all()
        ]

    total_count = int(
        db.query(func.count(ProjectMembership.id))
        .filter(ProjectMembership.user_id == target_uuid)
        .scalar()
        or 0
    )
    own_tokens, member_tokens = _calc_user_token_stats(db, target_uuid)

    return UserProfileResponse(
        user_id=str(target.id),
        name=target.name,
        email=target.email,
        joined_at=target.created_at.isoformat(),
        shared_projects_count=len(shared_ids),
        shared_project_names=shared_names,
        total_project_count=total_count,
        own_tokens=own_tokens,
        member_tokens=member_tokens,
        total_tokens=own_tokens + member_tokens,
    )


# ---------------------------------------------------------------------------
# Token leaderboard
# ---------------------------------------------------------------------------


class LeaderboardEntry(BaseModel):
    user_id: str
    name: str | None
    email: str
    own_tokens: int
    member_tokens: int
    total_tokens: int
    rank: int


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]
    current_user_id: str


@router.get("/leaderboard", response_model=LeaderboardResponse)
def get_leaderboard(
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Token usage leaderboard for all approved org members."""
    org_id = user.organization_id or DEFAULT_ORGANIZATION_ID
    org_users = (
        db.query(User)
        .filter(
            User.organization_id == org_id,
            User.approval_status == "approved",
            User.is_deleted == False,  # noqa: E712
        )
        .all()
    )

    entries: list[LeaderboardEntry] = []
    for u in org_users:
        own, mbr = _calc_user_token_stats(db, u.id)
        entries.append(
            LeaderboardEntry(
                user_id=str(u.id),
                name=u.name,
                email=u.email,
                own_tokens=own,
                member_tokens=mbr,
                total_tokens=own + mbr,
                rank=0,
            )
        )

    entries.sort(key=lambda e: e.total_tokens, reverse=True)
    for i, e in enumerate(entries):
        e.rank = i + 1

    return LeaderboardResponse(entries=entries, current_user_id=str(user.id))
