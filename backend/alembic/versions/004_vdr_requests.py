"""Add vdr_requests table for external-party VDR upload flow.

Revision ID: 004
Revises:     003
Create Date: 2026-05-13
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, Sequence[str], None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vdr_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("invited_by_id", sa.Uuid(), nullable=True),
        sa.Column("invited_email", sa.String(500), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_vdr_requests_token_hash"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invited_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_vdr_requests_project_id", "vdr_requests", ["project_id"])
    op.create_index("ix_vdr_requests_invited_email", "vdr_requests", ["invited_email"])
    op.create_index("ix_vdr_requests_token_hash", "vdr_requests", ["token_hash"])


def downgrade() -> None:
    op.drop_index("ix_vdr_requests_token_hash", "vdr_requests")
    op.drop_index("ix_vdr_requests_invited_email", "vdr_requests")
    op.drop_index("ix_vdr_requests_project_id", "vdr_requests")
    op.drop_table("vdr_requests")
