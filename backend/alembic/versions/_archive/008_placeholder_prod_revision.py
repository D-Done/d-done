"""Placeholder revision to match production alembic_version.

Revision ID: 008
Revises: 007

Production currently reports alembic_version = '008', but this repository
doesn't contain the historical 008 migration file that created that state.

This file is intentionally a no-op so Alembic can locate revision 008 and we
can safely migrate forward from the production baseline.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "008"
down_revision: Union[str, Sequence[str], None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # no-op (baseline alignment only)
    op.get_bind()


def downgrade() -> None:
    # no-op
    op.get_bind()

