"""Single canonical organization: Arnon.

Revision ID: 010
Revises: 009

Renames the default organization row to **Arnon**, repoints users/projects/invitations
to that UUID, and removes any other organization rows (after repointing).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "010"
down_revision: Union[str, Sequence[str], None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_ORG_ID = "a0000000-0000-4000-8000-000000000001"


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name

    if dialect == "postgresql":
        conn.execute(
            sa.text(
                """
                INSERT INTO organizations (id, name, created_at, updated_at)
                VALUES (CAST(:org_id AS uuid), 'Arnon', now(), now())
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    updated_at = now()
                """
            ),
            {"org_id": DEFAULT_ORG_ID},
        )
        conn.execute(
            sa.text(
                """
                UPDATE users
                SET organization_id = CAST(:org_id AS uuid)
                WHERE organization_id IS DISTINCT FROM CAST(:org_id AS uuid)
                   OR organization_id IS NULL
                """
            ),
            {"org_id": DEFAULT_ORG_ID},
        )
        conn.execute(
            sa.text(
                """
                UPDATE projects
                SET organization_id = CAST(:org_id AS uuid)
                WHERE organization_id IS DISTINCT FROM CAST(:org_id AS uuid)
                   OR organization_id IS NULL
                """
            ),
            {"org_id": DEFAULT_ORG_ID},
        )
        conn.execute(
            sa.text(
                """
                UPDATE invitations
                SET org_id = CAST(:org_id AS uuid)
                WHERE org_id IS DISTINCT FROM CAST(:org_id AS uuid)
                   OR org_id IS NULL
                """
            ),
            {"org_id": DEFAULT_ORG_ID},
        )
        conn.execute(
            sa.text("DELETE FROM organizations WHERE id <> CAST(:org_id AS uuid)"),
            {"org_id": DEFAULT_ORG_ID},
        )
    else:
        # SQLite / other: rename default row only (tests).
        row = conn.execute(
            sa.text("SELECT 1 FROM organizations WHERE id = :id"),
            {"id": DEFAULT_ORG_ID},
        ).first()
        if row:
            conn.execute(
                sa.text("UPDATE organizations SET name = 'Arnon' WHERE id = :id"),
                {"id": DEFAULT_ORG_ID},
            )
        else:
            conn.execute(
                sa.text(
                    "INSERT INTO organizations (id, name) VALUES (:id, 'Arnon')"
                ),
                {"id": DEFAULT_ORG_ID},
            )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE organizations SET name = 'Default' WHERE id = :id"
        ),
        {"id": DEFAULT_ORG_ID},
    )
