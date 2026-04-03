"""Append-only audit log helper."""

from __future__ import annotations

import uuid
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.auth import CurrentUser
from app.db.models import AuditLog


def record_audit(
    db: Session,
    *,
    actor: CurrentUser,
    action: str,
    entity_type: str,
    entity_id: UUID | None = None,
    entity_name: str | None = None,
    meta: dict[str, Any] | None = None,
    ip: str | None = None,
) -> None:
    """Insert an audit row. Caller must commit."""
    db.add(
        AuditLog(
            id=uuid.uuid4(),
            actor_id=actor.id,
            actor_email_snapshot=actor.email,
            actor_name_snapshot=actor.name,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            meta=meta,
            ip_address=ip,
        )
    )
