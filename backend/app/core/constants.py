"""Shared string constants and tiny pure utilities.

Import from here instead of using magic strings or duplicating logic.
"""

from __future__ import annotations

import hashlib


def invite_token_hash(raw: str) -> str:
    """SHA-256 hex digest of a raw invite token (used in DB and lookups)."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

# ---------------------------------------------------------------------------
# User approval status
# ---------------------------------------------------------------------------

APPROVAL_PENDING = "pending"
APPROVAL_APPROVED = "approved"
APPROVAL_REJECTED = "rejected"

VALID_APPROVAL_STATUSES = (APPROVAL_PENDING, APPROVAL_APPROVED, APPROVAL_REJECTED)

# ---------------------------------------------------------------------------
# Organisation roles
# ---------------------------------------------------------------------------

ROLE_MEMBER = "member"
ROLE_ADMIN = "admin"

VALID_INVITE_ROLES = (ROLE_ADMIN, ROLE_MEMBER)

# ---------------------------------------------------------------------------
# Invitation status
# ---------------------------------------------------------------------------

INVITATION_PENDING = "pending"
INVITATION_ACCEPTED = "accepted"
INVITATION_REVOKED = "revoked"

# Reasons returned by the public invite-preview endpoint
INVITE_REASON_INVALID = "invalid"
INVITE_REASON_REVOKED = "revoked"
INVITE_REASON_EXPIRED = "expired"
INVITE_REASON_ALREADY_USED = "already_used"

# ---------------------------------------------------------------------------
# OAuth provider identifiers
# ---------------------------------------------------------------------------

PROVIDER_GOOGLE = "google"
PROVIDER_MICROSOFT = "microsoft"

# Descope sometimes returns a generic value instead of a specific provider.
PROVIDER_GENERIC_OAUTH = "oauth"
PROVIDER_GENERIC_SOCIAL = "social"

DESCOPE_GENERIC_PROVIDERS = {PROVIDER_GENERIC_OAUTH, PROVIDER_GENERIC_SOCIAL}

# Allowed values accepted as providerHint from the frontend
VALID_PROVIDER_HINTS = (PROVIDER_GOOGLE, PROVIDER_MICROSOFT)

# Keys checked in Descope JWT claims for provider info
DESCOPE_CLAIM_OAUTH_PROVIDER = "oauthProvider"
DESCOPE_CLAIM_PROVIDER = "provider"
DESCOPE_CLAIM_AMR = "amr"
DESCOPE_CLAIM_LOGIN_IDS = "loginIds"

# ---------------------------------------------------------------------------
# Session cookies
# ---------------------------------------------------------------------------

SESSION_COOKIE_SECURE = "__Host-session"   # requires HTTPS
SESSION_COOKIE_DEV = "session"              # plain HTTP (local dev)
SESSION_COOKIE_SAMESITE = "lax"

# ---------------------------------------------------------------------------
# HTTP / infrastructure
# ---------------------------------------------------------------------------

HTTP_HEADER_USER_AGENT = "user-agent"
GCP_CLOUD_RUN_ENV_VAR = "K_SERVICE"

# ---------------------------------------------------------------------------
# Default organisation
# ---------------------------------------------------------------------------

DEFAULT_ORGANIZATION_NAME = "Arnon"

# ---------------------------------------------------------------------------
# Backend error detail strings
# (kept here so the frontend can match them exactly)
# ---------------------------------------------------------------------------

ERROR_AUTH_REQUIRED = "Authentication required."
ERROR_INVALID_SESSION = "Invalid or expired session."
ERROR_USER_NOT_FOUND = "User not found."
ERROR_ACCOUNT_DEACTIVATED = "Account deactivated."
ERROR_ACCOUNT_DELETED = "Account removed."
ERROR_ACCOUNT_NOT_APPROVED = "Account not approved. Status: {status}"
ERROR_ADMIN_REQUIRED = "Admin access required"
ERROR_INVITATION_REQUIRED = "Invitation required"
ERROR_INVITATION_INVALID = "Invalid invitation."
ERROR_INVITATION_REVOKED = "Invitation revoked."
ERROR_INVITATION_EXPIRED = "Invitation expired."
ERROR_INVITATION_ALREADY_USED = "Invitation already used."
ERROR_EMAIL_MISSING = "Email claim missing from Descope token."

# ---------------------------------------------------------------------------
# Audit — entity types and action names (append-only log)
# ---------------------------------------------------------------------------

ENTITY_PROJECT = "project"
ENTITY_FILE = "file"
ENTITY_USER = "user"
ENTITY_DD_CHECK = "dd_check"

AUDIT_ACTION_PROJECT_CREATE = "project.create"
AUDIT_ACTION_PROJECT_DELETE = "project.delete"
AUDIT_ACTION_PROJECT_MEMBER_ADD = "project.member.add"
AUDIT_ACTION_PROJECT_MEMBER_REMOVE = "project.member.remove"
AUDIT_ACTION_FILE_UPLOAD = "file.upload"
AUDIT_ACTION_FILE_VIEW = "file.view"
AUDIT_ACTION_USER_DELETE = "user.delete"
