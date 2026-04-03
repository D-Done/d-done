"""Organization-scoped endpoints — list users in the current user's organization."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_approved_user
from app.core.authorization import DEFAULT_ORGANIZATION_ID
from app.db.session import get_db
from app.db.models import User

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
