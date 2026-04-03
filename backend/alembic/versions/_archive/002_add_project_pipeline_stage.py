"""add project pipeline_stage

Revision ID: 002
Revises: 001
Create Date: 2026-03-01

Adds pipeline_stage to projects for analysis progress (doc_processing, extraction, synthesis, citation_locating).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, Sequence[str], None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("pipeline_stage", sa.String(50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("projects", "pipeline_stage")
