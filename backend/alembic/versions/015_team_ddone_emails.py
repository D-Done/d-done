"""015 add d-done.com email entries for team members

Revision ID: 015
Revises: 014
Create Date: 2026-07-17
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "015"
down_revision: Union[str, Sequence[str], None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Mapping: arnontl.com email → d-done.com email (same prefix, different domain)
# Add more entries here as team members confirm their D-Done login emails.
_DDONE_MEMBERS = [
    {"name": "יוסף",   "email": "yossef.m@d-done.com", "role": "admin"},
]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def upgrade() -> None:
    team_members = sa.table(
        "team_members",
        sa.column("id", sa.Uuid),
        sa.column("name", sa.String),
        sa.column("email", sa.String),
        sa.column("role", sa.String),
        sa.column("password_hash", sa.String),
        sa.column("created_at", sa.DateTime),
    )

    existing = op.get_bind().execute(sa.select(team_members.c.email)).fetchall()
    existing_emails = {row[0] for row in existing}

    rows = []
    for m in _DDONE_MEMBERS:
        if m["email"] not in existing_emails:
            rows.append({
                "id": uuid.uuid4(),
                "name": m["name"],
                "email": m["email"],
                "role": m["role"],
                "password_hash": None,
                "created_at": _utcnow(),
            })

    if rows:
        op.bulk_insert(team_members, rows)


def downgrade() -> None:
    team_members = sa.table("team_members", sa.column("email", sa.String))
    op.execute(
        team_members.delete().where(
            team_members.c.email.in_([m["email"] for m in _DDONE_MEMBERS])
        )
    )
