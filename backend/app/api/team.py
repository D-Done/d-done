"""Internal team task tracker — uses existing D-Done session auth."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.db.models import TeamMember, TeamTask
from app.db.session import get_db

router = APIRouter(prefix="/team", tags=["team"])


# ---------------------------------------------------------------------------
# Resolve the current D-Done user → TeamMember
# ---------------------------------------------------------------------------

def _get_team_member(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamMember:
    member = db.query(TeamMember).filter(
        TeamMember.email == current_user.email.lower()
    ).first()
    if not member:
        # Auto-register: D-Done admins get team admin role, everyone else gets lawyer
        member = TeamMember(
            name=current_user.name or current_user.email.split("@")[0],
            email=current_user.email.lower(),
            role="admin" if current_user.is_admin else "lawyer",
        )
        db.add(member)
        db.commit()
        db.refresh(member)
    return member


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class MemberOut(BaseModel):
    id: str
    name: str
    role: str


class MeResponse(BaseModel):
    id: str
    name: str
    role: str
    email: str


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    assigned_to_id: str
    due_date: Optional[datetime] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[datetime] = None


class TaskOut(BaseModel):
    id: str
    title: str
    description: Optional[str]
    status: str
    priority: str
    assigned_to_id: str
    assigned_to_name: str
    created_by_id: Optional[str]
    created_by_name: Optional[str]
    due_date: Optional[datetime]
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/me", response_model=MeResponse)
def get_me(member: TeamMember = Depends(_get_team_member)):
    return MeResponse(id=str(member.id), name=member.name, role=member.role, email=member.email or "")


@router.get("/members", response_model=list[MemberOut])
def list_members(
    member: TeamMember = Depends(_get_team_member),
    db: Session = Depends(get_db),
):
    members = db.query(TeamMember).order_by(TeamMember.name).all()
    return [MemberOut(id=str(m.id), name=m.name, role=m.role) for m in members]


@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(
    member: TeamMember = Depends(_get_team_member),
    db: Session = Depends(get_db),
):
    q = db.query(TeamTask)
    if member.role != "admin":
        q = q.filter(TeamTask.assigned_to_id == member.id)
    return [_task_out(t) for t in q.order_by(TeamTask.created_at.desc()).all()]


@router.post("/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    body: TaskCreate,
    member: TeamMember = Depends(_get_team_member),
    db: Session = Depends(get_db),
):
    if member.role != "admin" and body.assigned_to_id != str(member.id):
        raise HTTPException(status_code=403, detail="אין הרשאה ליצור משימה עבור אחר")

    assigned = db.query(TeamMember).filter(TeamMember.id == UUID(body.assigned_to_id)).first()
    if not assigned:
        raise HTTPException(status_code=404, detail="חבר צוות לא נמצא")

    task = TeamTask(
        title=body.title,
        description=body.description,
        priority=body.priority,
        assigned_to_id=assigned.id,
        created_by_id=member.id,
        due_date=body.due_date,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _task_out(task)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: str,
    body: TaskUpdate,
    member: TeamMember = Depends(_get_team_member),
    db: Session = Depends(get_db),
):
    task = db.query(TeamTask).filter(TeamTask.id == UUID(task_id)).first()
    if not task:
        raise HTTPException(status_code=404, detail="משימה לא נמצאה")
    if member.role != "admin" and task.assigned_to_id != member.id:
        raise HTTPException(status_code=403, detail="אין הרשאה לעדכן משימה זו")

    if body.title is not None:
        task.title = body.title
    if body.description is not None:
        task.description = body.description
    if body.status is not None:
        task.status = body.status
    if body.priority is not None and member.role == "admin":
        task.priority = body.priority
    if body.due_date is not None and member.role == "admin":
        task.due_date = body.due_date

    db.commit()
    db.refresh(task)
    return _task_out(task)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: str,
    member: TeamMember = Depends(_get_team_member),
    db: Session = Depends(get_db),
):
    if member.role != "admin":
        raise HTTPException(status_code=403, detail="רק אדמין יכול למחוק משימות")
    task = db.query(TeamTask).filter(TeamTask.id == UUID(task_id)).first()
    if not task:
        raise HTTPException(status_code=404, detail="משימה לא נמצאה")
    db.delete(task)
    db.commit()


def _task_out(t: TeamTask) -> TaskOut:
    return TaskOut(
        id=str(t.id),
        title=t.title,
        description=t.description,
        status=t.status,
        priority=t.priority,
        assigned_to_id=str(t.assigned_to_id),
        assigned_to_name=t.assigned_to.name if t.assigned_to else "",
        created_by_id=str(t.created_by_id) if t.created_by_id else None,
        created_by_name=t.created_by.name if t.created_by else None,
        due_date=t.due_date,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )
