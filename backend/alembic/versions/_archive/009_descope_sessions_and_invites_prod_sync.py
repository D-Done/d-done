"""Backfill Descope/session/invite schema on top of prod baseline.

Revision ID: 009
Revises: 008

Production is currently on revision '008' but is missing schema required by the
Descope + HttpOnly session auth flow (users.descope_user_id, app_sessions, etc.).

This migration is intentionally idempotent: it checks for existence before
creating/altering objects so it's safe across environments that may already
have some of these columns/tables.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "009"
down_revision: Union[str, Sequence[str], None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(connection, table: str, column: str) -> bool:
    result = connection.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :table AND column_name = :column"
        ),
        {"table": table, "column": column},
    )
    return result.scalar() is not None


def _table_exists(connection, table: str) -> bool:
    result = connection.execute(
        sa.text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = :table"
        ),
        {"table": table},
    )
    return result.scalar() is not None


def _index_exists(connection, index_name: str) -> bool:
    result = connection.execute(
        sa.text(
            "SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = :name"
        ),
        {"name": index_name},
    )
    return result.scalar() is not None


def upgrade() -> None:
    conn = op.get_bind()

    # organizations.domain
    if _table_exists(conn, "organizations") and not _column_exists(conn, "organizations", "domain"):
        op.add_column("organizations", sa.Column("domain", sa.String(255), nullable=True))

    # users identity fields used by Descope auth
    if _table_exists(conn, "users") and not _column_exists(conn, "users", "descope_user_id"):
        op.add_column("users", sa.Column("descope_user_id", sa.String(255), nullable=True))
    if _table_exists(conn, "users") and not _column_exists(conn, "users", "provider"):
        op.add_column("users", sa.Column("provider", sa.String(50), nullable=True))
    if _table_exists(conn, "users") and not _column_exists(conn, "users", "is_active"):
        op.add_column(
            "users",
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        )

    # Allow OAuth-only users to coexist with Descope-only users
    if _table_exists(conn, "users") and _column_exists(conn, "users", "google_id"):
        op.execute(sa.text("ALTER TABLE users ALTER COLUMN google_id DROP NOT NULL"))

    # invitations enhancements (invite-only onboarding)
    if _table_exists(conn, "invitations"):
        if not _column_exists(conn, "invitations", "org_id"):
            op.add_column(
                "invitations",
                sa.Column(
                    "org_id",
                    sa.Uuid(),
                    sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                    nullable=True,
                ),
            )
        if not _column_exists(conn, "invitations", "role"):
            op.add_column(
                "invitations",
                sa.Column("role", sa.String(20), nullable=False, server_default="member"),
            )
        if not _column_exists(conn, "invitations", "token_hash"):
            op.add_column("invitations", sa.Column("token_hash", sa.String(64), nullable=True))
        if not _column_exists(conn, "invitations", "expires_at"):
            op.add_column("invitations", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
        if not _column_exists(conn, "invitations", "revoked"):
            op.add_column(
                "invitations",
                sa.Column("revoked", sa.Boolean(), nullable=False, server_default="false"),
            )
        if not _column_exists(conn, "invitations", "revoked_at"):
            op.add_column("invitations", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))
        if not _column_exists(conn, "invitations", "accepted_at"):
            op.add_column("invitations", sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True))

    # indexes
    if _table_exists(conn, "users") and not _index_exists(conn, "ix_users_descope_user_id"):
        op.create_index("ix_users_descope_user_id", "users", ["descope_user_id"], unique=True)
    if _table_exists(conn, "invitations") and _column_exists(conn, "invitations", "token_hash") and not _index_exists(
        conn, "ix_invitations_token_hash"
    ):
        op.create_index("ix_invitations_token_hash", "invitations", ["token_hash"], unique=True)

    # app_sessions table for opaque HttpOnly sessions
    if not _table_exists(conn, "app_sessions"):
        op.create_table(
            "app_sessions",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("token", sa.String(86), nullable=False),
            sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("descope_user_id", sa.String(255), nullable=True),
            sa.Column("ip_address", sa.String(64), nullable=True),
            sa.Column("user_agent", sa.String(512), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_app_sessions_token", "app_sessions", ["token"], unique=True)
        op.create_index("ix_app_sessions_user_id", "app_sessions", ["user_id"])
        op.create_index("ix_app_sessions_expires_at", "app_sessions", ["expires_at"])


def downgrade() -> None:
    # We don't attempt to roll back a production sync migration.
    # (Downgrade is intentionally a no-op.)
    op.get_bind()

