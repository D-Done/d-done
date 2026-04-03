"""Shared pytest fixtures for D-Done backend tests.

Uses a file-based SQLite database so tests run without PostgreSQL.
Auth is overridden to always return a test user.
"""

from __future__ import annotations

import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.db.models import Base, User
from app.db.session import get_db, get_async_db
from app.core.auth import CurrentUser, get_current_user
from app.core.authorization import DEFAULT_ORGANIZATION_ID


# Use a file-based SQLite for tests (avoids UUID type issues with shared cache)
_TEST_DB_PATH = "/tmp/d_done_test.db"
TEST_DATABASE_URL = f"sqlite:///{_TEST_DB_PATH}"
TEST_DATABASE_URL_ASYNC = f"sqlite+aiosqlite:///{_TEST_DB_PATH}"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
)

test_async_engine = create_async_engine(
    TEST_DATABASE_URL_ASYNC,
    connect_args={"check_same_thread": False},
)

TestSessionLocal = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)
TestAsyncSessionLocal = async_sessionmaker(
    bind=test_async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Fixed test user info
TEST_GOOGLE_ID = "google-test-user-001"
TEST_EMAIL = "test@d-done.dev"
TEST_NAME = "Test User"


def _ensure_test_user(db_session):
    """Create the test user in the DB if it doesn't exist."""
    from app.db.models import Organization

    # Ensure default org exists (for project creation)
    org = db_session.query(Organization).filter(Organization.id == DEFAULT_ORGANIZATION_ID).first()
    if not org:
        org = Organization(id=DEFAULT_ORGANIZATION_ID, name="Arnon")
        db_session.add(org)
        db_session.commit()

    user = db_session.query(User).filter(User.google_id == TEST_GOOGLE_ID).first()
    if not user:
        user = User(
            organization_id=DEFAULT_ORGANIZATION_ID,
            google_id=TEST_GOOGLE_ID,
            email=TEST_EMAIL,
            name=TEST_NAME,
            approval_status="approved",
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
    else:
        if user.organization_id is None:
            user.organization_id = DEFAULT_ORGANIZATION_ID
        if (user.approval_status or "") != "approved":
            user.approval_status = "approved"
        db_session.commit()
        db_session.refresh(user)
    return user


def override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


def override_get_current_user():
    """Always return a test user for auth in tests."""
    db = TestSessionLocal()
    try:
        user = _ensure_test_user(db)
        return CurrentUser(user)
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    """Create all tables before each test, drop after."""
    # Remove any previous DB file
    if os.path.exists(_TEST_DB_PATH):
        os.remove(_TEST_DB_PATH)

    Base.metadata.create_all(bind=test_engine)

    # Ensure test user exists
    db = TestSessionLocal()
    _ensure_test_user(db)
    db.close()

    yield

    Base.metadata.drop_all(bind=test_engine)
    # Dispose engines so the file can be deleted
    test_engine.dispose()
    test_async_engine.sync_engine.dispose()
    if os.path.exists(_TEST_DB_PATH):
        os.remove(_TEST_DB_PATH)


async def override_get_async_db():
    """Use the same test SQLite DB for async endpoints."""
    async with TestAsyncSessionLocal() as session:
        yield session


@pytest.fixture()
def client() -> TestClient:
    """FastAPI test client with overridden DB and auth dependencies."""
    from app.main import app
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_async_db] = override_get_async_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def db_session():
    """A raw DB session for test setup."""
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()
