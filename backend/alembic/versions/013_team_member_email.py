"""013 replace pin_hash with email in team_members

Revision ID: 013
Revises: 012
Create Date: 2026-07-17
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013"
down_revision: Union[str, Sequence[str], None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("team_members", sa.Column("email", sa.String(500), nullable=True))
    op.create_unique_constraint("uq_team_members_email", "team_members", ["email"])
    op.drop_column("team_members", "pin_hash")


def downgrade() -> None:
    op.drop_constraint("uq_team_members_email", "team_members", type_="unique")
    op.drop_column("team_members", "email")
    op.add_column("team_members", sa.Column("pin_hash", sa.String(64), nullable=False, server_default=""))
