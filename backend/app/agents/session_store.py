"""ADK session persistence — singleton DatabaseSessionService backed by PostgreSQL.

Persists every agent run's state and full event history, enabling offline QA,
analytics, and replay. Thread-safe initialisation with a graceful shutdown hook
for FastAPI lifespan teardown.
"""

from __future__ import annotations

import logging
import threading
from typing import Any

from google.adk.sessions import DatabaseSessionService
from google.adk.sessions.base_session_service import GetSessionConfig

from app.core.config import settings

logger = logging.getLogger(__name__)

_service: DatabaseSessionService | None = None
_lock = threading.Lock()

# Maps sync driver prefixes → their async equivalents required by ADK.
_SYNC_TO_ASYNC: list[tuple[str, str]] = [
    ("postgresql+psycopg2://", "postgresql+asyncpg://"),
    ("postgresql+psycopg://", "postgresql+asyncpg://"),
    ("postgres://", "postgresql+asyncpg://"),
    ("postgresql://", "postgresql+asyncpg://"),
    ("sqlite://", "sqlite+aiosqlite://"),
]


def _as_async_url(db_url: str) -> str:
    """Return an async-driver database URL suitable for ADK's DatabaseSessionService."""
    url = db_url.strip()
    if not url:
        raise RuntimeError(
            "DATABASE_URL is empty — cannot initialise ADK session store"
        )
    for sync_prefix, async_prefix in _SYNC_TO_ASYNC:
        if url.startswith(sync_prefix):
            return async_prefix + url[len(sync_prefix) :]
    return url


def get_session_service() -> DatabaseSessionService:
    """Return (or lazily initialise) the process-wide DatabaseSessionService."""
    global _service
    if _service is not None:
        return _service
    with _lock:
        if _service is None:
            url = _as_async_url(settings.database_url)
            try:
                _service = DatabaseSessionService(db_url=url)
                logger.info(
                    "ADK DatabaseSessionService initialised (%s)", url.split("@")[-1]
                )
            except Exception:
                logger.exception("Failed to initialise ADK DatabaseSessionService")
                raise
    return _service


async def close_session_service() -> None:
    """Gracefully shut down the session service (call from FastAPI lifespan teardown)."""
    global _service
    with _lock:
        svc, _service = _service, None
    if svc is None:
        return
    try:
        if hasattr(svc, "close"):
            await svc.close()
            logger.info("ADK DatabaseSessionService closed")
    except Exception:
        logger.exception("Error closing ADK DatabaseSessionService")


def _serialise_event(ev: Any) -> dict[str, Any]:
    """Convert a single ADK Event to a JSON-serialisable dict."""
    text_parts: list[str] = []
    content = getattr(ev, "content", None)
    if content:
        for part in getattr(content, "parts", []) or []:
            if text := getattr(part, "text", None):
                text_parts.append(text)

    if hasattr(ev, "model_dump"):
        raw = ev.model_dump()
    elif hasattr(ev, "__dict__"):
        raw = dict(ev.__dict__)
    else:
        raw = str(ev)

    return {
        "id": getattr(ev, "id", None),
        "author": getattr(ev, "author", None),
        "timestamp": getattr(ev, "timestamp", None),
        "invocation_id": getattr(ev, "invocation_id", None),
        "text": "\n".join(text_parts).strip() or None,
        "raw": raw,
    }


async def get_session_events(
    *,
    app_name: str,
    user_id: str,
    session_id: str,
    num_recent_events: int | None = None,
) -> list[dict[str, Any]]:
    """Return session events as JSON-serialisable dicts, newest-first within the limit."""
    config = (
        GetSessionConfig(num_recent_events=num_recent_events)
        if num_recent_events
        else None
    )
    session = await get_session_service().get_session(
        app_name=app_name,
        user_id=user_id,
        session_id=session_id,
        config=config,
    )
    if not session:
        return []
    return [_serialise_event(ev) for ev in (getattr(session, "events", None) or [])]
