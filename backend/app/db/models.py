"""SQLAlchemy ORM models for the D-Done platform.

Tables
------
- ``organizations`` — Company / firm / workspace.
- ``users``        — Authenticated users (Descope identity + backend authorization).
- ``app_sessions`` — Opaque server-side sessions (HttpOnly cookie).
- ``projects``     — A due-diligence project (one per real-estate transaction).
- ``project_memberships`` — User–project role (owner | viewer).
- ``files``        — A document uploaded to GCS for a project.
- ``dd_checks``    — A DD analysis run for a project, with the full JSON report.
- ``invitations``  — Invite-only onboarding (hashed token, org-scoped).
- ``audit_log``    — Append-only security / activity events (identity snapshots).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    """Shared base class for all ORM models."""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Organization(Base):
    """Company / firm / workspace."""

    __tablename__ = "organizations"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String(500), nullable=False)
    domain = Column(String(255), nullable=True)
    language = Column(String(10), nullable=False, default="he")
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )

    users = relationship("User", back_populates="organization")
    projects = relationship("Project", back_populates="organization")
    invitations = relationship("Invitation", back_populates="organization")
    groups = relationship("Group", back_populates="organization")

    def __repr__(self) -> str:
        return f"<Organization id={self.id} name={self.name!r}>"


class User(Base):
    """An authenticated user — identity from Descope, authorization in this DB."""

    __tablename__ = "users"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id = Column(
        Uuid,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # Descope stable user id (sub claim)
    descope_user_id = Column(String(255), unique=True, nullable=True, index=True)
    # Legacy / fallback: provider-specific id (e.g. google:xxx, microsoft:xxx)
    google_id = Column(String(255), unique=True, nullable=True, index=True)
    # Identity provider hint: google | microsoft | enterprise
    provider = Column(String(50), nullable=True)
    email = Column(String(500), unique=True, nullable=False, index=True)
    name = Column(String(500), nullable=True)
    picture = Column(String(1000), nullable=True)
    team = Column(String(500), nullable=True)
    # "pending" → awaiting admin approval, "approved" → full access, "rejected" → denied
    approval_status = Column(String(20), nullable=False, default="pending", server_default="pending")
    is_admin = Column(Boolean, nullable=False, default=False, server_default="false")
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    is_deleted = Column(Boolean, nullable=False, default=False, server_default="false")
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    deleted_by_id = Column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    has_completed_onboarding = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )

    # Relationships
    organization = relationship("Organization", back_populates="users")
    projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")
    project_memberships = relationship(
        "ProjectMembership",
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="ProjectMembership.user_id",
    )
    sessions = relationship(
        "AppSession",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    deleted_by = relationship(
        "User",
        remote_side=[id],
        foreign_keys=[deleted_by_id],
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"


class AppSession(Base):
    """Server-side opaque session for HttpOnly cookie auth."""

    __tablename__ = "app_sessions"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    token = Column(String(86), unique=True, nullable=False, index=True)
    user_id = Column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    descope_user_id = Column(String(255), nullable=True)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)

    user = relationship("User", back_populates="sessions")

    def __repr__(self) -> str:
        return f"<AppSession id={self.id} user_id={self.user_id}>"


class Project(Base):
    """A due-diligence project — one per real-estate transaction."""

    __tablename__ = "projects"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id = Column(
        Uuid,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    owner_id = Column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="pending")
    pipeline_stage = Column(String(50), nullable=True)  # doc_processing | extraction | synthesis | citation_locating
    # Drives pipeline dispatch in analysis._run_analysis. See app.agents.schemas.TransactionType.
    transaction_type = Column(
        String(50),
        nullable=False,
        default="real_estate_finance",
        server_default="real_estate_finance",
    )
    # Structured project details (client_name, role, counterparty_name, free-text description).
    # Replaces the earlier "stuff it into description" hack; consumed by the M&A viewer.
    transaction_metadata = Column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )

    # Relationships
    organization = relationship("Organization", back_populates="projects")
    owner = relationship("User", back_populates="projects")
    memberships = relationship(
        "ProjectMembership",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    files = relationship("File", back_populates="project", cascade="all, delete-orphan")
    dd_checks = relationship("DDCheck", back_populates="project", cascade="all, delete-orphan")
    report_comments = relationship("ReportComment", back_populates="project", cascade="all, delete-orphan")
    checklist_items = relationship("ChecklistItem", back_populates="project", cascade="all, delete-orphan")
    checklist_shares = relationship("ChecklistShare", back_populates="project", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Project id={self.id} title={self.title!r} status={self.status}>"


class ProjectMembership(Base):
    """Links a user to a project with a role (owner | viewer)."""

    __tablename__ = "project_memberships"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_project_memberships_project_user"),)

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id = Column(
        Uuid,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String(20), nullable=False)  # owner | viewer
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )

    project = relationship("Project", back_populates="memberships")
    user = relationship("User", back_populates="project_memberships", foreign_keys=[user_id])

    def __repr__(self) -> str:
        return f"<ProjectMembership project={self.project_id} user={self.user_id} role={self.role}>"


class Group(Base):
    """A named group of users within an organization, used to bulk-add members to projects."""

    __tablename__ = "groups"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id = Column(
        Uuid,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(200), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )

    organization = relationship("Organization", back_populates="groups")
    memberships = relationship("GroupMembership", back_populates="group", cascade="all, delete-orphan")


class GroupMembership(Base):
    """Links a user to a group."""

    __tablename__ = "group_memberships"
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_memberships_group_user"),)

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    group_id = Column(Uuid, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    group = relationship("Group", back_populates="memberships")
    user = relationship("User")


class File(Base):
    """A document uploaded to GCS for analysis within a project."""

    __tablename__ = "files"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id = Column(
        Uuid,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    original_name = Column(String(500), nullable=False)
    gcs_uri = Column(String(1000), nullable=False)
    content_type = Column(String(100), nullable=False, default="application/pdf")
    doc_type = Column(String(50), nullable=False, default="other")
    file_size_bytes = Column(Integer, nullable=True)
    upload_status = Column(String(50), nullable=False, default="pending")
    source = Column(String(50), nullable=True)  # None = analysis upload, "checklist_upload" = from checklist
    uploaded_by_id = Column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )

    # Relationships
    project = relationship("Project", back_populates="files")
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])

    def __repr__(self) -> str:
        return (
            f"<File id={self.id} original_name={self.original_name!r} "
            f"status={self.upload_status}>"
        )


class DDCheck(Base):
    """A DD analysis run for a project.

    Stores the full structured JSON report from the AI agent, plus
    metadata about the run (status, timing, token usage).
    """

    __tablename__ = "dd_checks"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id = Column(
        Uuid,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status = Column(
        String(50),
        nullable=False,
        default="pending",
    )  # pending | processing | completed | failed | partial

    # The full structured DD report as JSON (matches DDReport schema)
    # Uses JSONB on PostgreSQL for query support, falls back to JSON on SQLite
    report = Column(JSON().with_variant(JSONB, "postgresql"), nullable=True)

    # HITL: intermediate data for tenant table review (tenant_records + signing_sources)
    hitl_data = Column(JSON().with_variant(JSONB, "postgresql"), nullable=True)

    # ADK session linkage (persisted session + event history)
    agent_session_id = Column(String(100), nullable=True)
    judge_session_id = Column(String(100), nullable=True)

    # Error message if the check failed
    error_message = Column(Text, nullable=True)

    # Timing
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Token usage from Gemini
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    total_tokens = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )

    # Relationships
    project = relationship("Project", back_populates="dd_checks")

    def __repr__(self) -> str:
        return f"<DDCheck id={self.id} project_id={self.project_id} status={self.status}>"


class Invitation(Base):
    """Pre-approved email invitation sent by an admin.

    Raw token is never stored; only SHA-256 hex hash of the token.
    """

    __tablename__ = "invitations"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    email = Column(String(500), nullable=False, index=True)
    org_id = Column(
        Uuid,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    role = Column(String(20), nullable=False, default="member", server_default="member")
    token_hash = Column(String(64), unique=True, nullable=True, index=True)
    # SHA-256 hex of raw invite token; null for legacy rows before migration
    invited_by_id = Column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    status = Column(String(20), nullable=False, default="pending")  # pending | accepted | revoked | expired
    revoked = Column(Boolean, nullable=False, default=False, server_default="false")
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    invited_by = relationship("User", foreign_keys=[invited_by_id])
    organization = relationship("Organization", back_populates="invitations")

    def __repr__(self) -> str:
        return f"<Invitation id={self.id} email={self.email!r} status={self.status}>"


class AiConversation(Base):
    """A saved AI chat conversation, optionally linked to a project."""

    __tablename__ = "ai_conversations"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id = Column(
        Uuid,
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title = Column(String(500), nullable=True)
    messages = Column(JSON().with_variant(JSONB, "postgresql"), nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )

    user = relationship("User", foreign_keys=[user_id])
    project = relationship("Project")

    def __repr__(self) -> str:
        return f"<AiConversation id={self.id} user_id={self.user_id}>"


class VdrRequest(Base):
    """An external-party VDR (Virtual Data Room) upload request.

    The owner creates a request, which generates a secure token that is emailed
    to an external party. The external party uses the token to upload documents
    without authenticating. The owner receives a notification when analysis
    completes; the external party never sees any project data.
    """

    __tablename__ = "vdr_requests"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id = Column(
        Uuid,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    invited_by_id = Column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    invited_email = Column(String(500), nullable=False, index=True)
    # SHA-256 hex of the raw upload token (never stored raw)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    # pending → awaiting upload | uploaded → files received, analysis running
    # done → report ready | expired | revoked
    status = Column(String(20), nullable=False, default="pending")
    expires_at = Column(DateTime(timezone=True), nullable=False)
    uploaded_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    project = relationship("Project")
    invited_by = relationship("User", foreign_keys=[invited_by_id])

    def __repr__(self) -> str:
        return f"<VdrRequest id={self.id} email={self.invited_email!r} status={self.status}>"


class AuditLog(Base):
    """Append-only audit trail (identity frozen at action time)."""

    __tablename__ = "audit_log"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    actor_id = Column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    actor_email_snapshot = Column(String(500), nullable=False)
    actor_name_snapshot = Column(String(500), nullable=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(Uuid, nullable=True)
    entity_name = Column(String(500), nullable=True)
    meta = Column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    ip_address = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    actor = relationship("User", foreign_keys=[actor_id])

    def __repr__(self) -> str:
        return f"<AuditLog id={self.id} action={self.action!r} entity={self.entity_type}>"


class ReportComment(Base):
    """An in-app comment on a specific section of a DD report."""

    __tablename__ = "report_comments"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id = Column(
        Uuid,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    section_key = Column(String(100), nullable=False)
    content = Column(Text, nullable=False)
    author_name = Column(String(200), nullable=True)
    author_email = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    project = relationship("Project", back_populates="report_comments")

    def __repr__(self) -> str:
        return f"<ReportComment id={self.id} section={self.section_key!r}>"


class ChecklistItem(Base):
    """A single item in the project's completeness checklist."""

    __tablename__ = "checklist_items"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id = Column(
        Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    check_id = Column(Uuid, nullable=True)  # which DD check generated this
    category = Column(String(50), nullable=False)  # missing_doc | warning_note | mortgage | lender | signing | corporate | other
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    is_completed = Column(Boolean, nullable=False, default=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    completed_by = Column(String(200), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    project = relationship("Project", back_populates="checklist_items")

    def __repr__(self) -> str:
        return f"<ChecklistItem id={self.id} category={self.category!r} completed={self.is_completed}>"


class CustomAgent(Base):
    """A custom AI agent built conversationally by a lawyer via the Agent Builder."""

    __tablename__ = "custom_agents"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id = Column(
        Uuid,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    created_by_id = Column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # draft → agent is still being built | published → ready to run
    status = Column(String(20), nullable=False, default="draft", server_default="draft")

    # Hidden agent configuration — filled in by Builder LLM via tool calls
    name = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    system_prompt = Column(Text, nullable=True)
    # List of {file_id, original_name, gcs_uri, size_bytes} dicts
    knowledge_base_files = Column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
        server_default="[]",
    )
    # LLM-defined structured extraction schema (field name → description/type)
    extracted_fields_schema = Column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=True,
    )

    # Full builder conversation history: [{role, content}]
    builder_messages = Column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
        server_default="[]",
    )

    is_deleted = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )

    created_by = relationship("User", foreign_keys=[created_by_id])
    organization = relationship("Organization")

    def __repr__(self) -> str:
        return f"<CustomAgent id={self.id} name={self.name!r} status={self.status}>"


class Notebook(Base):
    """An AI-powered notebook — upload documents and chat about them (NotebookLM-style)."""

    __tablename__ = "notebooks"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id = Column(
        Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_by_id = Column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = Column(String(500), nullable=False, default="Untitled Notebook")
    is_deleted = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow)

    created_by = relationship("User", foreign_keys=[created_by_id])
    organization = relationship("Organization")
    sources = relationship("NotebookSource", back_populates="notebook", cascade="all, delete-orphan", order_by="NotebookSource.created_at")
    messages = relationship("NotebookMessage", back_populates="notebook", cascade="all, delete-orphan", order_by="NotebookMessage.created_at")

    def __repr__(self) -> str:
        return f"<Notebook id={self.id} title={self.title!r}>"


class NotebookSource(Base):
    """A source document uploaded to a notebook."""

    __tablename__ = "notebook_sources"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    notebook_id = Column(
        Uuid, ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    original_name = Column(String(500), nullable=False)
    gcs_uri = Column(String(1000), nullable=False)
    file_size_bytes = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    notebook = relationship("Notebook", back_populates="sources")

    def __repr__(self) -> str:
        return f"<NotebookSource id={self.id} name={self.original_name!r}>"


class NotebookMessage(Base):
    """A single message in a notebook conversation."""

    __tablename__ = "notebook_messages"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    notebook_id = Column(
        Uuid, ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role = Column(String(20), nullable=False)  # "user" | "model"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    notebook = relationship("Notebook", back_populates="messages")

    def __repr__(self) -> str:
        return f"<NotebookMessage id={self.id} role={self.role}>"


class ChecklistShare(Base):
    """Token-based share link giving an external party view + upload access."""

    __tablename__ = "checklist_shares"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id = Column(
        Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash = Column(String(64), nullable=False, unique=True)
    invited_email = Column(String(200), nullable=False)
    message = Column(Text, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by_email = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    project = relationship("Project", back_populates="checklist_shares")

    def __repr__(self) -> str:
        return f"<ChecklistShare id={self.id} email={self.invited_email!r}>"
