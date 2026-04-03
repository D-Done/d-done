"""Tests for the /projects/{id}/analyze and /projects/{id}/results endpoints."""

from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_project_with_file(client: TestClient) -> str:
    """Create a project, upload a file, and return the project ID."""
    # Create project
    resp = client.post("/api/v1/projects/", json={"title": "Analysis Test"})
    assert resp.status_code == 201
    project_id = resp.json()["id"]

    # Initiate + complete upload (mocked GCS)
    with patch("app.api.upload.create_resumable_session") as mock_create:
        mock_create.return_value = (
            "https://storage.googleapis.com/upload/session",
            f"gs://test-bucket/{project_id}/test.pdf",
        )
        init_resp = client.post("/api/v1/upload/initiate", json={
            "project_id": project_id,
            "filename": "test.pdf",
            "content_type": "application/pdf",
        })
        assert init_resp.status_code == 200
        file_id = init_resp.json()["file_id"]

    # Complete the upload
    complete_resp = client.post("/api/v1/upload/complete", json={
        "file_id": file_id,
        "file_size_bytes": 2048,
    })
    assert complete_resp.status_code == 200

    return project_id


# ---------------------------------------------------------------------------
# POST /projects/{id}/analyze
# ---------------------------------------------------------------------------


class TestAnalyze:

    def test_analyze_rejects_no_files(self, client: TestClient):
        """Cannot analyze a project with no uploaded files."""
        resp = client.post("/api/v1/projects/", json={"title": "Empty Project"})
        project_id = resp.json()["id"]

        resp = client.post(f"/api/v1/projects/{project_id}/analyze")
        assert resp.status_code == 400
        assert "no uploaded files" in resp.json()["detail"].lower()

    def test_analyze_rejects_nonexistent_project(self, client: TestClient):
        resp = client.post("/api/v1/projects/00000000-0000-0000-0000-000000000000/analyze")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /projects/{id}/results
# ---------------------------------------------------------------------------


class TestResults:

    def test_results_not_found_when_no_analysis(self, client: TestClient):
        resp = client.post("/api/v1/projects/", json={"title": "No Analysis"})
        project_id = resp.json()["id"]

        resp = client.get(f"/api/v1/projects/{project_id}/results")
        assert resp.status_code == 404

    def test_results_nonexistent_project(self, client: TestClient):
        resp = client.get("/api/v1/projects/00000000-0000-0000-0000-000000000000/results")
        assert resp.status_code == 404
