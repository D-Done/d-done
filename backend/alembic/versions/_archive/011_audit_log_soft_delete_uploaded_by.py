"""Audit log, user soft-delete, file uploaded_by_id.

Revision ID: 011
Revises: 010

Idempotent for PostgreSQL (information_schema / pg_indexes). Uses SQLAlchemy
inspect for SQLite compatibility.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "011"
down_revision: Union[str, Sequence[str], None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(insp: sa.Inspector, table: str, column: str) -> bool:
    if not insp.has_table(table):
        return False
    return any(c["name"] == column for c in insp.get_columns(table))


def _index_exists_pg(conn, index_name: str) -> bool:
    r = conn.execute(
        sa.text("SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = :n"),
        {"n": index_name},
    )
    return r.scalar() is not None


def _index_on_table(insp: sa.Inspector, table: str, index_name: str) -> bool:
    if not insp.has_table(table):
        return False
    for ix in insp.get_indexes(table):
        if ix.get("name") == index_name:
            return True
    return False


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    dialect = bind.dialect.name

    # --- users: soft delete ---
    if insp.has_table("users"):
        if not _column_exists(insp, "users", "is_deleted"):
            op.add_column(
                "users",
                sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
            )
        if not _column_exists(insp, "users", "deleted_at"):
            op.add_column("users", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        if not _column_exists(insp, "users", "deleted_by_id"):
            op.add_column(
                "users",
                sa.Column(
                    "deleted_by_id",
                    sa.Uuid(),
                    sa.ForeignKey("users.id", ondelete="SET NULL"),
                    nullable=True,
                ),
            )

    # --- files: uploader ---
    if insp.has_table("files") and not _column_exists(insp, "files", "uploaded_by_id"):
        op.add_column(
            "files",
            sa.Column(
                "uploaded_by_id",
                sa.Uuid(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        insp = sa.inspect(bind)
        if dialect == "postgresql":
            if not _index_exists_pg(bind, "ix_files_uploaded_by_id"):
                op.create_index("ix_files_uploaded_by_id", "files", ["uploaded_by_id"])
        elif not _index_on_table(insp, "files", "ix_files_uploaded_by_id"):
            op.create_index("ix_files_uploaded_by_id", "files", ["uploaded_by_id"])

    # --- audit_log ---
    if not insp.has_table("audit_log"):
        json_type = sa.JSON().with_variant(JSONB(), "postgresql")
        op.create_table(
            "audit_log",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("actor_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("actor_email_snapshot", sa.String(500), nullable=False),
            sa.Column("actor_name_snapshot", sa.String(500), nullable=True),
            sa.Column("action", sa.String(100), nullable=False),
            sa.Column("entity_type", sa.String(50), nullable=False),
            sa.Column("entity_id", sa.Uuid(), nullable=True),
            sa.Column("entity_name", sa.String(500), nullable=True),
            sa.Column("meta", json_type, nullable=True),
            sa.Column("ip_address", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_audit_log_entity", "audit_log", ["entity_type", "entity_id"])
        op.create_index("ix_audit_log_actor_id", "audit_log", ["actor_id"])
        op.create_index("ix_audit_log_created_at", "audit_log", ["created_at"])
    else:
        # Idempotent indexes (e.g. partial upgrade)
        if dialect == "postgresql":
            if not _index_exists_pg(bind, "ix_audit_log_entity"):
                op.create_index("ix_audit_log_entity", "audit_log", ["entity_type", "entity_id"])
            if not _index_exists_pg(bind, "ix_audit_log_actor_id"):
                op.create_index("ix_audit_log_actor_id", "audit_log", ["actor_id"])
            if not _index_exists_pg(bind, "ix_audit_log_created_at"):
                op.create_index("ix_audit_log_created_at", "audit_log", ["created_at"])
        else:
            if not _index_on_table(insp, "audit_log", "ix_audit_log_entity"):
                op.create_index("ix_audit_log_entity", "audit_log", ["entity_type", "entity_id"])
            if not _index_on_table(insp, "audit_log", "ix_audit_log_actor_id"):
                op.create_index("ix_audit_log_actor_id", "audit_log", ["actor_id"])
            if not _index_on_table(insp, "audit_log", "ix_audit_log_created_at"):
                op.create_index("ix_audit_log_created_at", "audit_log", ["created_at"])


def downgrade() -> None:
    # Intentionally minimal: audit + soft-delete are security-sensitive.
    op.get_bind()
