"""014 add password_hash to team_members and seed the team

Revision ID: 014
Revises: 013
Create Date: 2026-07-17
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "014"
down_revision: Union[str, Sequence[str], None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_MEMBERS = [
    {"name": "רינת",    "email": "rinatm@arnontl.com",    "role": "admin"},
    {"name": "אליאור",  "email": "eliorg@arnontl.com",    "role": "admin"},
    {"name": "יוסף",    "email": "yossef.m@arnontl.com",  "role": "lawyer"},
    {"name": "ענבל",    "email": "inbals@arnontl.com",    "role": "lawyer"},
    {"name": "רועי",    "email": "roei.f@arnontl.com",    "role": "lawyer"},
    {"name": "נתנאל",   "email": "natanel.k@arnontl.com", "role": "lawyer"},
]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def upgrade() -> None:
    op.add_column("team_members", sa.Column("password_hash", sa.String(200), nullable=True))

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
    for m in _MEMBERS:
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
    op.drop_column("team_members", "password_hash")
