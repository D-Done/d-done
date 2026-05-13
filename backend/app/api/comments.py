"""Report comment endpoints.

CRUD for in-app annotations on DD report sections.
GET /api/v1/projects/{project_id}/comments
POST /api/v1/projects/{project_id}/comments
DELETE /api/v1/projects/{project_id}/comments/{comment_id}
"""

from __future__ import annotations

import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_approved_user
from app.core.authorization import require_project_access
from app.db.models import ReportComment
from app.db.session import get_db

router = APIRouter(prefix="/api/v1/projects", tags=["comments"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class CommentIn(BaseModel):
    section_key: str = Field(max_length=100)
    content: str = Field(min_length=1, max_length=5000)


class CommentOut(BaseModel):
    id: str
    section_key: str
    content: str
    author_name: str | None
    author_email: str | None
    created_at: datetime.datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_model(cls, c: ReportComment) -> "CommentOut":
        return cls(
            id=str(c.id),
            section_key=c.section_key,
            content=c.content,
            author_name=c.author_name,
            author_email=c.author_email,
            created_at=c.created_at,
        )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{project_id}/comments", response_model=list[CommentOut])
def list_comments(
    project_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    require_project_access(db, user.id, project_id)
    comments = (
        db.query(ReportComment)
        .filter(ReportComment.project_id == project_id)
        .order_by(ReportComment.created_at.asc())
        .all()
    )
    return [CommentOut.from_orm_model(c) for c in comments]


@router.post("/{project_id}/comments", response_model=CommentOut, status_code=201)
def add_comment(
    project_id: UUID,
    body: CommentIn,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    require_project_access(db, user.id, project_id)
    comment = ReportComment(
        project_id=project_id,
        section_key=body.section_key,
        content=body.content,
        author_name=user.name,
        author_email=user.email,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return CommentOut.from_orm_model(comment)


@router.delete("/{project_id}/comments/{comment_id}", status_code=204)
def delete_comment(
    project_id: UUID,
    comment_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    require_project_access(db, user.id, project_id)
    comment = db.query(ReportComment).filter(
        ReportComment.id == comment_id,
        ReportComment.project_id == project_id,
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    # Only author or admin can delete
    if comment.author_email != user.email and not getattr(user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    db.delete(comment)
    db.commit()
    return Response(status_code=204)
