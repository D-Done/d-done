"""Project authorization — access and owner checks (D-42).

A user can access a project if they are the creator (owner_id) or have a
project_membership. Roles: owner (full), viewer (view only).
"""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Project, ProjectMembership

# Default organization UUID used by migration 003; used when creating new users.
DEFAULT_ORGANIZATION_ID = UUID("a0000000-0000-4000-8000-000000000001")


def get_project_role(db: Session, user_id: UUID, project_id: UUID) -> str | None:
    """Return the user's role for the project: 'owner' or 'viewer', or None if no access.

    Creator (project.owner_id) counts as owner even without a membership row.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return None
    if project.owner_id == user_id:
        return "owner"
    membership = (
        db.query(ProjectMembership)
        .filter(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == user_id,
        )
        .first()
    )
    if not membership:
        return None
    return membership.role


def require_project_access(
    db: Session, user_id: UUID, project_id: UUID
) -> tuple[Project, str]:
    """Return (project, role) if the user has access; raise 404 otherwise."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    role = get_project_role(db, user_id, project_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project, role


def require_project_owner(db: Session, user_id: UUID, project_id: UUID) -> Project:
    """Return the project if the user has owner role; raise 403 or 404 otherwise."""
    project, role = require_project_access(db, user_id, project_id)
    if role != "owner":
        raise HTTPException(status_code=403, detail="Only project owners can perform this action")
    return project


def project_ids_accessible_by_user(db: Session, user_id: UUID):
    """Return a subquery of project IDs the user can access (owner or member)."""
    from sqlalchemy import select

    return select(Project.id).where(
        or_(
            Project.owner_id == user_id,
            Project.id.in_(
                select(ProjectMembership.project_id).where(
                    ProjectMembership.user_id == user_id
                )
            ),
        )
    )


# ---- Async versions for analysis endpoints ----


async def get_project_role_async(
    db: AsyncSession, user_id: UUID, project_id: UUID
) -> str | None:
    """Async: return 'owner' | 'viewer' | None."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        return None
    if project.owner_id == user_id:
        return "owner"
    result = await db.execute(
        select(ProjectMembership).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == user_id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        return None
    return membership.role


async def require_project_access_async(
    db: AsyncSession, user_id: UUID, project_id: UUID
) -> tuple[Project, str]:
    """Async: return (project, role) or raise 404."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    role = await get_project_role_async(db, user_id, project_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project, role


async def require_project_owner_async(
    db: AsyncSession, user_id: UUID, project_id: UUID
) -> Project:
    """Async: return project if user is owner; else 403/404."""
    project, role = await require_project_access_async(db, user_id, project_id)
    if role != "owner":
        raise HTTPException(status_code=403, detail="Only project owners can perform this action")
    return project
