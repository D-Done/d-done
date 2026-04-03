"""Descope SDK client — singleton with lazy initialisation.

Usage
-----
    from app.core.descope_client import validate_descope_session

    claims = validate_descope_session(token)   # raises HTTPException on failure
    descope_user_id = claims["sub"]
    email           = claims["email"]
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from fastapi import HTTPException

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_client():
    """Return a cached DescopeClient. Raises RuntimeError if DESCOPE_PROJECT_ID is unset."""
    from app.core.config import settings
    from descope import DescopeClient  # type: ignore[import]

    project_id = settings.descope_project_id
    if not project_id:
        raise RuntimeError(
            "DESCOPE_PROJECT_ID is not set. "
            "Add it to .env.local or as a Cloud Run environment variable."
        )
    return DescopeClient(project_id=project_id)


def validate_descope_session(token: str) -> dict[str, Any]:
    """Validate a Descope session JWT and return its claims dict.

    Raises HTTPException(401) on any validation failure so it can be used
    directly as a FastAPI dependency helper.

    Returned dict includes at minimum:
        sub   — Descope user ID (stable, use as primary key)
        email — verified email address
    Optional fields (present when set in Descope):
        name, picture, loginIds, customClaims, ...
    """
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        client = _get_client()
        resp = client.validate_session(session_token=token)
        # Descope SDK returns {"token": {...claims...}}
        claims: dict[str, Any] = resp.get("token", resp) if isinstance(resp, dict) else {}
        if not claims.get("sub"):
            raise HTTPException(status_code=401, detail="Invalid Descope token: missing sub.")
        return claims
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Descope session validation failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid or expired session token.")
