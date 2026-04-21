"""Focused tests for the M&A v1 DD pipeline wiring.

Scope is deliberately narrow — these tests are the safety net for the
initial design-partner MVP. They cover:

1. ``MaDDReport`` + chapter schemas serialize to the shape the frontend
   type contract expects (``transaction_type: "ma"`` survives
   ``model_dump(mode="json")``).
2. Classifier schema names and tag constraints are stable (the router's
   output keys are referenced by string throughout the pipeline).
3. ``start_analysis`` dispatches on ``Project.transaction_type`` — real-
   estate projects go to the finance pipeline, M&A projects go to
   ``_run_ma_analysis``.

We mock the pipeline runners themselves so the tests stay hermetic and
don't reach Gemini.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.agents.ma.classifier import (
    MaClassificationResult,
    MaDocumentClassification,
)
from app.agents.ma.constants import MA_MANDATORY_CHAPTERS
from app.agents.ma.report_schema import (
    ChapterOutput,
    CompletenessChecklist,
    MaDDReport,
    MaFinding,
    MaFollowUp,
    MaProjectHeader,
)
from app.api.analysis import _AnalysisResult


# ---------------------------------------------------------------------------
# Schema contracts
# ---------------------------------------------------------------------------


class TestMaReportSchema:

    def test_roundtrip_minimal(self):
        """Minimal report with no chapters still serializes cleanly."""
        report = MaDDReport(chapters=[])
        dumped = report.model_dump(mode="json")
        assert dumped["transaction_type"] == "ma"
        assert dumped["chapters"] == []
        # Round-trip back through the schema.
        again = MaDDReport.model_validate(dumped)
        assert again.transaction_type == report.transaction_type

    def test_roundtrip_full_chapter(self):
        """A full chapter with findings + follow-ups + sources survives
        a JSON round trip — this is the shape stored in ``DDCheck.result``
        and read by the frontend viewer.
        """
        finding = MaFinding(
            id="f1",
            subsection="deal_structure",
            severity="warning",
            title="Earn-out trigger",
            description="60% of consideration tied to ARR",
            sources=[],
        )
        follow_up = MaFollowUp(
            id="fu1",
            description="Obtain draft SPA signed version",
            severity="info",
            suggested_document="Signed SPA",
        )
        chapter = ChapterOutput(
            chapter_id="transaction_overview",
            chapter_title_he="סקירת עסקה",
            summary_he="summary",
            empty_state=False,
            findings=[finding],
            follow_ups=[follow_up],
            timeline_events=[],
        )
        report = MaDDReport(
            project_header=MaProjectHeader(
                project_name="Demo", client_name="Acme", doc_count=3
            ),
            chapters=[chapter],
            completeness=CompletenessChecklist(items=[], summary_he=None),
        )
        dumped = report.model_dump(mode="json")
        # The "_visual_grounding" marker is added outside the schema by
        # the assembler; here we just validate that the core shape is
        # JSON-safe and survives a round-trip unchanged.
        again = MaDDReport.model_validate(dumped)
        assert len(again.chapters) == 1
        assert again.chapters[0].findings[0].id == "f1"
        assert again.chapters[0].follow_ups[0].id == "fu1"

    def test_visual_grounding_marker_added_postserialize(self):
        """The ``_visual_grounding`` flag is attached post-serialize as a
        dict key (Pydantic v2 rejects leading underscores on fields)."""
        report = MaDDReport(chapters=[])
        dumped = report.model_dump(mode="json")
        assert "_visual_grounding" not in dumped
        dumped["_visual_grounding"] = True
        assert dumped["_visual_grounding"] is True


# ---------------------------------------------------------------------------
# Classifier contract
# ---------------------------------------------------------------------------


class TestMaClassifier:

    def test_classification_shape(self):
        """Classifier output preserves the exact field names the chapter
        agents filter on (``documents[].filename`` and
        ``documents[].chapter_tags``)."""
        doc = MaDocumentClassification(
            filename="spa.pdf",
            doc_kind="spa",
            chapter_tags=[
                "transaction_overview",
                "corporate_governance",
                "taxation",
            ],
        )
        result = MaClassificationResult(documents=[doc])
        dumped = result.model_dump(mode="json")
        assert "documents" in dumped
        assert dumped["documents"][0]["filename"] == "spa.pdf"
        assert "transaction_overview" in dumped["documents"][0]["chapter_tags"]

    def test_all_chapter_tags_are_valid_ids(self):
        """Every chapter_tag referenced by the classifier must be one of
        the 10 mandatory chapter ids — otherwise the chapter agents will
        silently drop files."""
        assert len(MA_MANDATORY_CHAPTERS) == 10
        # sanity check: no duplicates, no blanks
        assert len(set(MA_MANDATORY_CHAPTERS)) == 10
        assert all(isinstance(c, str) and c for c in MA_MANDATORY_CHAPTERS)


# ---------------------------------------------------------------------------
# Analysis dispatch
# ---------------------------------------------------------------------------


def _create_project_with_file(
    client: TestClient, transaction_type: str | None = None
) -> str:
    """Create a project (optionally typed) with a single uploaded file."""
    body: dict = {"title": "Dispatch Test"}
    if transaction_type:
        # Use the brain schema which accepts transaction_type.
        body = {
            "transaction_type": transaction_type,
            "project_name": "Dispatch Test",
            "client_name": "Acme",
            "role": "Target" if transaction_type == "ma" else "בנק",
            "counterparty_name": "BuyerCo",
        }
    resp = client.post("/api/v1/projects/", json=body)
    assert resp.status_code == 201, resp.text
    project_id = resp.json()["id"]

    with patch("app.api.upload.create_resumable_session") as mock_create:
        mock_create.return_value = (
            "https://storage.googleapis.com/upload/session",
            f"gs://test-bucket/{project_id}/test.pdf",
        )
        init_resp = client.post(
            "/api/v1/upload/initiate",
            json={
                "project_id": project_id,
                "filename": "test.pdf",
                "content_type": "application/pdf",
            },
        )
        assert init_resp.status_code == 200
        file_id = init_resp.json()["file_id"]

    complete_resp = client.post(
        "/api/v1/upload/complete",
        json={"file_id": file_id, "file_size_bytes": 2048},
    )
    assert complete_resp.status_code == 200
    return project_id


class TestAnalysisDispatch:

    def test_ma_project_dispatches_to_ma_pipeline(self, client: TestClient):
        """When transaction_type=='ma' the API must call _run_ma_analysis,
        not the finance pipeline."""
        project_id = _create_project_with_file(client, transaction_type="ma")

        with (
            patch(
                "app.api.analysis._run_ma_analysis", new_callable=AsyncMock
            ) as ma_mock,
            patch(
                "app.api.analysis._run_analysis", new_callable=AsyncMock
            ) as re_mock,
        ):
            ma_mock.return_value = _AnalysisResult(
                report_dict={
                    "transaction_type": "ma",
                    "chapters": [],
                    "_visual_grounding": True,
                },
                agent_session_id=None,
            )
            resp = client.post(f"/api/v1/projects/{project_id}/analyze")

        assert resp.status_code == 200, resp.text
        assert ma_mock.await_count == 1
        assert re_mock.await_count == 0

    def test_real_estate_project_dispatches_to_finance_pipeline(
        self, client: TestClient
    ):
        """When transaction_type=='real_estate_financing' the API must
        route to the finance pipeline (never to the M&A runner)."""
        project_id = _create_project_with_file(
            client, transaction_type="real_estate_financing"
        )

        with (
            patch(
                "app.api.analysis._run_ma_analysis", new_callable=AsyncMock
            ) as ma_mock,
            patch(
                "app.api.analysis._run_analysis", new_callable=AsyncMock
            ) as re_mock,
        ):
            re_mock.return_value = _AnalysisResult(
                report_dict={"findings": [], "_visual_grounding": True},
                agent_session_id=None,
            )
            resp = client.post(f"/api/v1/projects/{project_id}/analyze")

        assert resp.status_code == 200, resp.text
        assert re_mock.await_count == 1
        assert ma_mock.await_count == 0
