"""add hitl_data to dd_checks

Revision ID: 004
Revises: 003
Create Date: 2026-03-09

Adds hitl_data JSONB column to dd_checks for HITL tenant table review payload.
Idempotent: safe to run when the column already exists (e.g. after manual SQL).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "004"
down_revision: Union[str, Sequence[str], None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _hitl_data_column_exists(connection) -> bool:
    result = connection.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'dd_checks' AND column_name = 'hitl_data'"
        )
    )
    return result.scalar() is not None


def upgrade() -> None:
    conn = op.get_bind()
    if not _hitl_data_column_exists(conn):
        op.add_column(
            "dd_checks",
            sa.Column("hitl_data", JSONB, nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _hitl_data_column_exists(conn):
        op.drop_column("dd_checks", "hitl_data")
