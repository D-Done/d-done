"""Database engine and session factories.

Provides both **sync** (psycopg2) and **async** (asyncpg / aiosqlite) engines
so that CRUD endpoints keep using the familiar ``Session`` while the
long-running analysis endpoints can ``await`` agent calls on the main event
loop without blocking it.

Supports both PostgreSQL (production) and SQLite (local dev).
"""

from __future__ import annotations

from collections.abc import AsyncGenerator, Generator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------


def _to_sync_url(url: str) -> str:
    """Normalise a database URL to use a **sync** driver (psycopg2 / sqlite).

    Handles the case where DATABASE_URL is set with the asyncpg driver
    (e.g. ``postgresql+asyncpg://…``).  The sync engine cannot use asyncpg,
    so we strip the dialect modifier.
    """
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql://", 1)
    if url.startswith("sqlite+aiosqlite://"):
        return url.replace("sqlite+aiosqlite://", "sqlite://", 1)
    return url


def _to_async_url(url: str) -> str:
    """Convert a sync SQLAlchemy database URL to its async-driver equivalent."""
    if url.startswith("postgresql+asyncpg://") or url.startswith("sqlite+aiosqlite://"):
        return url
    # Common sync drivers — normalize to asyncpg for async engine usage.
    if url.startswith("postgresql+psycopg2://"):
        return url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql+psycopg://"):
        return url.replace("postgresql+psycopg://", "postgresql+asyncpg://", 1)
    # Some providers still use the deprecated postgres:// scheme.
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("sqlite://"):
        return url.replace("sqlite://", "sqlite+aiosqlite://", 1)
    return url


# ---------------------------------------------------------------------------
# Detect database flavour
# ---------------------------------------------------------------------------

_sync_url = _to_sync_url(settings.database_url)
_is_sqlite = _sync_url.startswith("sqlite")

# ---------------------------------------------------------------------------
# Sync engine (used by projects, upload, settings endpoints)
# ---------------------------------------------------------------------------

_sync_kwargs: dict = {"pool_pre_ping": True}

if _is_sqlite:
    _sync_kwargs["connect_args"] = {"check_same_thread": False}
else:
    _sync_kwargs["pool_size"] = 5
    _sync_kwargs["max_overflow"] = 10

engine = create_engine(_sync_url, **_sync_kwargs)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency — yields a **sync** DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Async engine (used by analysis endpoints + ADK session store)
# ---------------------------------------------------------------------------

_async_url = _to_async_url(settings.database_url)

_async_kwargs: dict = {"pool_pre_ping": True}
if not _is_sqlite:
    _async_kwargs["pool_size"] = 5
    _async_kwargs["max_overflow"] = 10

async_engine = create_async_engine(_async_url, **_async_kwargs)
AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields an **async** DB session."""
    async with AsyncSessionLocal() as session:
        yield session
