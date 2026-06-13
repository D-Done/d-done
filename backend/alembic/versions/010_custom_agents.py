"""010 add custom_agents table

Revision ID: 010
Revises: 009
Create Date: 2026-06-13
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "010"
down_revision: Union[str, Sequence[str], None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSON = sa.JSON().with_variant(JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "custom_agents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("name", sa.String(500), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("system_prompt", sa.Text(), nullable=True),
        sa.Column("knowledge_base_files", _JSON, nullable=False, server_default="[]"),
        sa.Column("extracted_fields_schema", _JSON, nullable=True),
        sa.Column("builder_messages", _JSON, nullable=False, server_default="[]"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_custom_agents_created_by_id", "custom_agents", ["created_by_id"]
    )
    op.create_index(
        "ix_custom_agents_organization_id", "custom_agents", ["organization_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_custom_agents_organization_id", table_name="custom_agents")
    op.drop_index("ix_custom_agents_created_by_id", table_name="custom_agents")
    op.drop_table("custom_agents")
