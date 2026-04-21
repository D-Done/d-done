"""Add ``transaction_type`` and ``transaction_metadata`` to ``projects``.

Revision ID: 002
Revises:     001
Create Date: 2026-04-19

Why
---
M&A v1 (Linear D-157) needs to dispatch the analysis pipeline on a structured
field instead of sniffing the project description. ``transaction_type`` is the
switch (real_estate_finance | ma | company_investment); ``transaction_metadata``
holds the structured "project details" (client, role, counterparty, free-text
description) the frontend currently crams into the description Text column.

Existing rows default to ``real_estate_finance`` so the finance pipeline
continues to run unchanged.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "002"
down_revision: Union[str, Sequence[str], None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSON = sa.JSON().with_variant(JSONB(), "postgresql")


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column(
            "transaction_type",
            sa.String(50),
            nullable=False,
            server_default="real_estate_finance",
        ),
    )
    op.add_column(
        "projects",
        sa.Column("transaction_metadata", _JSON, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("projects", "transaction_metadata")
    op.drop_column("projects", "transaction_type")
