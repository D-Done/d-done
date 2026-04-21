"""Tests for the /upload endpoints."""

from __future__ import annotations

from unittest.mock import patch
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.models import File


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_project_via_api(client: TestClient, title: str = "Test Project") -> str:
    """Create a project via the API and return its ID string."""
    resp = client.post("/api/v1/projects/", json={"title": title})
    assert resp.status_code == 201
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def mock_gcs():
    """Patch the GCS service so no real GCP calls are made."""
    with patch("app.api.upload.create_resumable_session") as mock_create, \
         patch("app.api.upload.verify_gcs_connectivity") as mock_verify:
        mock_create.return_value = (
            "https://storage.googleapis.com/upload/storage/v1/b/test-bucket/o?uploadType=resumable&upload_id=abc123",
            "gs://test-bucket/proj-123/test.pdf",
        )
        mock_verify.return_value = {
            "status": "ok",
            "bucket": "d-done",
            "location": "ME-WEST1",
        }
        yield {"create_session": mock_create, "verify": mock_verify}


# ---------------------------------------------------------------------------
# /upload/initiate
# ---------------------------------------------------------------------------


class TestInitiateUpload:
    """Tests for POST /api/v1/upload/initiate."""

    def test_initiate_success(self, client: TestClient, mock_gcs):
        project_id = _create_project_via_api(client)
        resp = client.post("/api/v1/upload/initiate", json={
            "project_id": project_id,
            "filename": "tabu_extract.pdf",
            "content_type": "application/pdf",
            "doc_type": "tabu",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert "upload_url" in body
        assert "file_id" in body
        assert "gcs_uri" in body
        assert body["bucket_location"] == "me-west1"
        assert body["max_size_bytes"] > 0

    def test_initiate_with_file_size(self, client: TestClient, mock_gcs):
        project_id = _create_project_via_api(client)
        resp = client.post("/api/v1/upload/initiate", json={
            "project_id": project_id,
            "filename": "small.pdf",
            "content_type": "application/pdf",
            "file_size": 1024,
        })
        assert resp.status_code == 200

    def test_initiate_rejects_oversized_file(self, client: TestClient, mock_gcs):
        project_id = _create_project_via_api(client)
        resp = client.post("/api/v1/upload/initiate", json={
            "project_id": project_id,
            "filename": "huge.pdf",
            "content_type": "application/pdf",
            "file_size": 600 * 1024 * 1024,  # 600 MiB > 500 MiB limit
        })
        assert resp.status_code == 400
        assert "exceeds" in resp.json()["detail"].lower()

    def test_initiate_rejects_invalid_content_type(self, client: TestClient, mock_gcs):
        project_id = _create_project_via_api(client)
        resp = client.post("/api/v1/upload/initiate", json={
            "project_id": project_id,
            "filename": "malware.exe",
            "content_type": "application/x-executable",
        })
        assert resp.status_code == 400
        assert "not allowed" in resp.json()["detail"].lower()

    def test_initiate_rejects_empty_filename(self, client: TestClient):
        project_id = _create_project_via_api(client)
        resp = client.post("/api/v1/upload/initiate", json={
            "project_id": project_id,
            "filename": "",
            "content_type": "application/pdf",
        })
        assert resp.status_code == 422  # Pydantic validation error

    def test_initiate_rejects_missing_project(self, client: TestClient, mock_gcs):
        resp = client.post("/api/v1/upload/initiate", json={
            "project_id": "00000000-0000-0000-0000-000000000000",
            "filename": "test.pdf",
            "content_type": "application/pdf",
        })
        assert resp.status_code == 404

    def test_initiate_rejects_invalid_project_id(self, client: TestClient, mock_gcs):
        resp = client.post("/api/v1/upload/initiate", json={
            "project_id": "not-a-uuid",
            "filename": "test.pdf",
            "content_type": "application/pdf",
        })
        assert resp.status_code == 400

    def test_initiate_gcs_failure_returns_502(self, client: TestClient):
        project_id = _create_project_via_api(client)
        with patch("app.api.upload.create_resumable_session") as mock_create:
            mock_create.side_effect = RuntimeError("GCS unavailable")
            resp = client.post("/api/v1/upload/initiate", json={
                "project_id": project_id,
                "filename": "test.pdf",
                "content_type": "application/pdf",
            })
            assert resp.status_code == 502

    def test_initiate_allows_image_types(self, client: TestClient, mock_gcs):
        project_id = _create_project_via_api(client)
        for ct in ["image/jpeg", "image/png", "image/tiff"]:
            resp = client.post("/api/v1/upload/initiate", json={
                "project_id": project_id,
                "filename": "scan.jpg",
                "content_type": ct,
            })
            assert resp.status_code == 200, f"Should accept {ct}"

    def test_initiate_creates_file_record(self, client: TestClient, db_session: Session, mock_gcs):
        """Verify the file row is created in the DB with status=pending."""
        project_id = _create_project_via_api(client)
        resp = client.post("/api/v1/upload/initiate", json={
            "project_id": project_id,
            "filename": "contract.pdf",
            "content_type": "application/pdf",
            "doc_type": "tabu",
            "file_size": 5000,
        })
        assert resp.status_code == 200
        file_id = resp.json()["file_id"]

        # Check DB
        file_row = db_session.query(File).filter(File.id == UUID(file_id)).first()
        assert file_row is not None
        assert file_row.upload_status == "pending"
        assert file_row.original_name == "contract.pdf"
        assert file_row.doc_type == "tabu"


# ---------------------------------------------------------------------------
# /upload/complete
# ---------------------------------------------------------------------------


class TestCompleteUpload:
    """Tests for POST /api/v1/upload/complete."""

    def test_complete_success(self, client: TestClient, db_session: Session, mock_gcs):
        # Setup: create project + initiate upload
        project_id = _create_project_via_api(client)
        init_resp = client.post("/api/v1/upload/initiate", json={
            "project_id": project_id,
            "filename": "test.pdf",
            "content_type": "application/pdf",
        })
        file_id = init_resp.json()["file_id"]

        # Complete
        resp = client.post("/api/v1/upload/complete", json={
            "file_id": file_id,
            "file_size_bytes": 2048,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["upload_status"] == "uploaded"
        assert body["file_id"] == file_id

        # Verify DB record was updated
        file_row = db_session.query(File).filter(File.id == UUID(file_id)).first()
        assert file_row.upload_status == "uploaded"
        assert file_row.file_size_bytes == 2048

    def test_complete_rejects_missing_file(self, client: TestClient):
        resp = client.post("/api/v1/upload/complete", json={
            "file_id": "00000000-0000-0000-0000-000000000000",
            "file_size_bytes": 1024,
        })
        assert resp.status_code == 404

    def test_complete_rejects_oversized(self, client: TestClient, mock_gcs):
        project_id = _create_project_via_api(client)
        init_resp = client.post("/api/v1/upload/initiate", json={
            "project_id": project_id,
            "filename": "test.pdf",
            "content_type": "application/pdf",
        })
        file_id = init_resp.json()["file_id"]

        resp = client.post("/api/v1/upload/complete", json={
            "file_id": file_id,
            "file_size_bytes": 600 * 1024 * 1024,  # 600 MiB > 500 MiB limit
        })
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# /upload/health
# ---------------------------------------------------------------------------


class TestGCSHealth:
    """Tests for GET /api/v1/upload/health."""

    def test_health_ok(self, client: TestClient, mock_gcs):
        resp = client.get("/api/v1/upload/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["location"] == "ME-WEST1"

    def test_health_failure(self, client: TestClient):
        with patch("app.api.upload.verify_gcs_connectivity") as mock_verify:
            mock_verify.return_value = {
                "status": "error",
                "detail": "Connection refused",
            }
            resp = client.get("/api/v1/upload/health")
            assert resp.status_code == 503
