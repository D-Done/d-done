"""008 add language field to organizations

Revision ID: 008
Revises: 007
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("language", sa.String(10), nullable=False, server_default="he"),
    )


def downgrade() -> None:
    op.drop_column("organizations", "language")
