"""011 add notebooks tables

Revision ID: 011
Revises: 010
Create Date: 2026-06-15
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011"
down_revision: Union[str, Sequence[str], None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notebooks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(500), nullable=False, server_default="Untitled Notebook"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notebooks_created_by_id", "notebooks", ["created_by_id"])
    op.create_index("ix_notebooks_organization_id", "notebooks", ["organization_id"])

    op.create_table(
        "notebook_sources",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("notebook_id", sa.Uuid(), nullable=False),
        sa.Column("original_name", sa.String(500), nullable=False),
        sa.Column("gcs_uri", sa.String(1000), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["notebook_id"], ["notebooks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notebook_sources_notebook_id", "notebook_sources", ["notebook_id"])

    op.create_table(
        "notebook_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("notebook_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["notebook_id"], ["notebooks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notebook_messages_notebook_id", "notebook_messages", ["notebook_id"])


def downgrade() -> None:
    op.drop_index("ix_notebook_messages_notebook_id", table_name="notebook_messages")
    op.drop_table("notebook_messages")
    op.drop_index("ix_notebook_sources_notebook_id", table_name="notebook_sources")
    op.drop_table("notebook_sources")
    op.drop_index("ix_notebooks_organization_id", table_name="notebooks")
    op.drop_index("ix_notebooks_created_by_id", table_name="notebooks")
    op.drop_table("notebooks")
