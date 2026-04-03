"""Tests for the /projects endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# POST /projects/ — Create
# ---------------------------------------------------------------------------


class TestCreateProject:

    def test_create_project(self, client: TestClient):
        resp = client.post("/api/v1/projects/", json={
            "title": "רכישת דירה ברחוב הרצל",
            "description": "בדיקת נאותות לנכס",
        })
        assert resp.status_code == 201
        body = resp.json()
        assert body["title"] == "רכישת דירה ברחוב הרצל"
        assert body["description"] == "בדיקת נאותות לנכס"
        assert body["status"] == "pending"
        assert "id" in body
        # UUID format check
        assert len(body["id"]) == 36

    def test_create_project_without_description(self, client: TestClient):
        resp = client.post("/api/v1/projects/", json={
            "title": "Test Project",
        })
        assert resp.status_code == 201
        assert resp.json()["description"] is None

    def test_create_project_rejects_empty_title(self, client: TestClient):
        resp = client.post("/api/v1/projects/", json={
            "title": "",
        })
        assert resp.status_code == 422

    def test_create_project_has_dd_checks_field(self, client: TestClient):
        resp = client.post("/api/v1/projects/", json={
            "title": "DD Check Test",
        })
        assert resp.status_code == 201
        body = resp.json()
        assert "dd_checks" in body
        assert body["dd_checks"] == []


# ---------------------------------------------------------------------------
# GET /projects/ — List
# ---------------------------------------------------------------------------


class TestListProjects:

    def test_list_empty(self, client: TestClient):
        resp = client.get("/api/v1/projects/")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_returns_projects(self, client: TestClient):
        # Create two projects
        client.post("/api/v1/projects/", json={"title": "Project A"})
        client.post("/api/v1/projects/", json={"title": "Project B"})

        resp = client.get("/api/v1/projects/")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        # Newest first
        assert data[0]["title"] == "Project B"
        assert "file_count" in data[0]


# ---------------------------------------------------------------------------
# GET /projects/{id} — Get
# ---------------------------------------------------------------------------


class TestGetProject:

    def test_get_project(self, client: TestClient):
        create_resp = client.post("/api/v1/projects/", json={"title": "My DD"})
        project_id = create_resp.json()["id"]

        resp = client.get(f"/api/v1/projects/{project_id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == project_id
        assert body["title"] == "My DD"
        assert body["files"] == []
        assert body["dd_checks"] == []

    def test_get_project_not_found(self, client: TestClient):
        resp = client.get("/api/v1/projects/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /projects/{id}/status
# ---------------------------------------------------------------------------


class TestProjectStatus:

    def test_get_status(self, client: TestClient):
        create_resp = client.post("/api/v1/projects/", json={"title": "Status Test"})
        project_id = create_resp.json()["id"]

        resp = client.get(f"/api/v1/projects/{project_id}/status")
        assert resp.status_code == 200
        assert resp.json()["status"] == "pending"


# ---------------------------------------------------------------------------
# DELETE /projects/{id}
# ---------------------------------------------------------------------------


class TestDeleteProject:

    def test_delete_project(self, client: TestClient):
        create_resp = client.post("/api/v1/projects/", json={"title": "To Delete"})
        project_id = create_resp.json()["id"]

        # Delete
        resp = client.delete(f"/api/v1/projects/{project_id}")
        assert resp.status_code == 204

        # Verify it's gone
        resp = client.get(f"/api/v1/projects/{project_id}")
        assert resp.status_code == 404

    def test_delete_nonexistent(self, client: TestClient):
        resp = client.delete("/api/v1/projects/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404
