"""add onboarding fields and invitations table

Revision ID: 006
Revises: 005
Create Date: 2026-03-13

Adds team, has_completed_onboarding to users table.
Creates invitations table for admin email invitations.
Idempotent: safe to run when columns/tables already exist.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "006"
down_revision: Union[str, Sequence[str], None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(connection, table: str, column: str) -> bool:
    result = connection.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :table AND column_name = :column"
        ),
        {"table": table, "column": column},
    )
    return result.scalar() is not None


def _table_exists(connection, table: str) -> bool:
    result = connection.execute(
        sa.text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = :table"
        ),
        {"table": table},
    )
    return result.scalar() is not None


def upgrade() -> None:
    conn = op.get_bind()

    if not _column_exists(conn, "users", "team"):
        op.add_column("users", sa.Column("team", sa.String(500), nullable=True))

    if not _column_exists(conn, "users", "has_completed_onboarding"):
        op.add_column(
            "users",
            sa.Column("has_completed_onboarding", sa.Boolean(), nullable=False, server_default="false"),
        )

    if not _table_exists(conn, "invitations"):
        op.create_table(
            "invitations",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("email", sa.String(500), nullable=False, index=True),
            sa.Column("invited_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "invitations"):
        op.drop_table("invitations")
    if _column_exists(conn, "users", "has_completed_onboarding"):
        op.drop_column("users", "has_completed_onboarding")
    if _column_exists(conn, "users", "team"):
        op.drop_column("users", "team")
