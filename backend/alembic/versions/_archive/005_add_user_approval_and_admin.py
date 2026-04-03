"""add approval_status and is_admin to users

Revision ID: 005
Revises: 004
Create Date: 2026-03-09

Adds approval_status (pending/approved/rejected) and is_admin flag to users table.
Existing users are set to 'approved' so they aren't locked out.
Idempotent: safe to run when columns already exist.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "005"
down_revision: Union[str, Sequence[str], None] = "004"
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


def upgrade() -> None:
    conn = op.get_bind()

    if not _column_exists(conn, "users", "approval_status"):
        op.add_column(
            "users",
            sa.Column("approval_status", sa.String(20), nullable=False, server_default="pending"),
        )
        # Existing users should be approved so they aren't locked out
        conn.execute(sa.text("UPDATE users SET approval_status = 'approved' WHERE approval_status = 'pending'"))

    if not _column_exists(conn, "users", "is_admin"):
        op.add_column(
            "users",
            sa.Column("is_admin", sa.Boolean(), nullable=False, server_default="false"),
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _column_exists(conn, "users", "is_admin"):
        op.drop_column("users", "is_admin")
    if _column_exists(conn, "users", "approval_status"):
        op.drop_column("users", "approval_status")
