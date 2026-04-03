"""organizations and project_memberships (D-42 authorization)

Revision ID: 003
Revises: 002
Create Date: 2026-03-09

Adds Organization, ProjectMembership; links User and Project to Organization.
Backfills one default organization and owner memberships for existing projects.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, Sequence[str], None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create organizations table
    op.create_table(
        "organizations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 2. Insert default organization for backfill (deterministic UUID)
    default_org_uuid = "a0000000-0000-4000-8000-000000000001"
    op.execute(
        sa.text(
            "INSERT INTO organizations (id, name, created_at, updated_at) "
            "VALUES ('a0000000-0000-4000-8000-000000000001', 'Default', now(), now())"
        )
    )

    # 3. Add organization_id to users (nullable), backfill, then NOT NULL
    op.add_column(
        "users",
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
    )
    op.execute(
        sa.text("UPDATE users SET organization_id = 'a0000000-0000-4000-8000-000000000001'")
    )
    op.alter_column(
        "users",
        "organization_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
    op.create_index("ix_users_organization_id", "users", ["organization_id"], unique=False)

    # 4. Add organization_id to projects (nullable), backfill, then NOT NULL
    op.add_column(
        "projects",
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
    )
    op.execute(
        sa.text("UPDATE projects SET organization_id = 'a0000000-0000-4000-8000-000000000001'")
    )
    op.alter_column(
        "projects",
        "organization_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
    op.create_index("ix_projects_organization_id", "projects", ["organization_id"], unique=False)

    # 5. Create project_memberships
    op.create_table(
        "project_memberships",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "user_id", name="uq_project_memberships_project_user"),
    )

    # 6. Backfill: one owner membership per project (project.owner_id)
    op.execute(
        sa.text(
            "INSERT INTO project_memberships (id, project_id, user_id, role, created_at, updated_at) "
            "SELECT gen_random_uuid(), id, owner_id, 'owner', now(), now() FROM projects"
        )
    )


def downgrade() -> None:
    op.drop_table("project_memberships")
    op.drop_index("ix_projects_organization_id", table_name="projects")
    op.drop_column("projects", "organization_id")
    op.drop_index("ix_users_organization_id", table_name="users")
    op.drop_column("users", "organization_id")
    op.drop_table("organizations")
