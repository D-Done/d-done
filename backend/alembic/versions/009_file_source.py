"""009 add source column to files

Revision ID: 009
Revises: 008
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "files",
        sa.Column("source", sa.String(50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("files", "source")
