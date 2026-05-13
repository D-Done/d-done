"""User group management endpoints.

Groups are named collections of users within an organization.
They can be attached to projects to bulk-add all members at once.
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_approved_user
from app.core.authorization import DEFAULT_ORGANIZATION_ID
from app.db.models import Group, GroupMembership, Project, ProjectMembership, User
from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/groups", tags=["groups"])


# ── Schemas ──────────────────────────────────────────────────────────────────


class GroupMemberOut(BaseModel):
    user_id: str
    email: str
    name: str | None


class GroupOut(BaseModel):
    id: str
    name: str
    member_count: int
    members: list[GroupMemberOut]


class CreateGroupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)


class RenameGroupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)


class AddGroupMemberRequest(BaseModel):
    email: str


class AddGroupToProjectResponse(BaseModel):
    added: int
    skipped: int


# ── Helpers ───────────────────────────────────────────────────────────────────


def _require_group(db: Session, group_id: UUID, org_id: UUID) -> Group:
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.organization_id != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return group


def _group_out(group: Group) -> GroupOut:
    members = []
    for m in group.memberships:
        if m.user:
            members.append(GroupMemberOut(
                user_id=str(m.user.id),
                email=m.user.email,
                name=m.user.name,
            ))
    return GroupOut(
        id=str(group.id),
        name=group.name,
        member_count=len(members),
        members=members,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("", response_model=list[GroupOut])
def list_groups(
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    org_id = user.organization_id or DEFAULT_ORGANIZATION_ID
    groups = db.query(Group).filter(Group.organization_id == org_id).order_by(Group.name).all()
    return [_group_out(g) for g in groups]


@router.post("", response_model=GroupOut, status_code=201)
def create_group(
    body: CreateGroupRequest,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    org_id = user.organization_id or DEFAULT_ORGANIZATION_ID
    group = Group(organization_id=org_id, name=body.name.strip())
    db.add(group)
    db.commit()
    db.refresh(group)
    return _group_out(group)


@router.patch("/{group_id}", response_model=GroupOut)
def rename_group(
    group_id: UUID,
    body: RenameGroupRequest,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    org_id = user.organization_id or DEFAULT_ORGANIZATION_ID
    group = _require_group(db, group_id, org_id)
    group.name = body.name.strip()
    db.commit()
    db.refresh(group)
    return _group_out(group)


@router.delete("/{group_id}", status_code=204)
def delete_group(
    group_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    org_id = user.organization_id or DEFAULT_ORGANIZATION_ID
    group = _require_group(db, group_id, org_id)
    db.delete(group)
    db.commit()


@router.post("/{group_id}/members", response_model=GroupMemberOut, status_code=201)
def add_group_member(
    group_id: UUID,
    body: AddGroupMemberRequest,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    org_id = user.organization_id or DEFAULT_ORGANIZATION_ID
    group = _require_group(db, group_id, org_id)

    email = body.email.strip().lower()
    invitee = db.query(User).filter(User.email == email).first()
    if not invitee or getattr(invitee, "is_deleted", False):
        raise HTTPException(
            status_code=404,
            detail="No user found with this email. They must sign in once to join the platform.",
        )
    if (invitee.organization_id or DEFAULT_ORGANIZATION_ID) != org_id:
        raise HTTPException(status_code=403, detail="User is not in your organization")

    existing = (
        db.query(GroupMembership)
        .filter(GroupMembership.group_id == group_id, GroupMembership.user_id == invitee.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="User is already in this group")

    membership = GroupMembership(group_id=group.id, user_id=invitee.id)
    db.add(membership)
    db.commit()

    return GroupMemberOut(user_id=str(invitee.id), email=invitee.email, name=invitee.name)


@router.delete("/{group_id}/members/{user_id}", status_code=204)
def remove_group_member(
    group_id: UUID,
    user_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    org_id = user.organization_id or DEFAULT_ORGANIZATION_ID
    _require_group(db, group_id, org_id)

    membership = (
        db.query(GroupMembership)
        .filter(GroupMembership.group_id == group_id, GroupMembership.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Member not found in group")
    db.delete(membership)
    db.commit()


@router.post("/{group_id}/add-to-project/{project_id}", response_model=AddGroupToProjectResponse)
def add_group_to_project(
    group_id: UUID,
    project_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Add all members of a group to a project as viewers."""
    org_id = user.organization_id or DEFAULT_ORGANIZATION_ID
    group = _require_group(db, group_id, org_id)

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the project owner can add members")

    added = 0
    skipped = 0
    for gm in group.memberships:
        if not gm.user or getattr(gm.user, "is_deleted", False):
            skipped += 1
            continue
        if gm.user_id == user.id:
            skipped += 1
            continue
        existing = (
            db.query(ProjectMembership)
            .filter(
                ProjectMembership.project_id == project_id,
                ProjectMembership.user_id == gm.user_id,
            )
            .first()
        )
        if existing:
            skipped += 1
            continue
        db.add(ProjectMembership(project_id=project_id, user_id=gm.user_id, role="viewer"))
        added += 1

    db.commit()
    logger.info("Group %s added to project %s: added=%d skipped=%d", group_id, project_id, added, skipped)
    return AddGroupToProjectResponse(added=added, skipped=skipped)
