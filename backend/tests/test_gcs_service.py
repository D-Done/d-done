"""Tests for the GCS service layer (app.services.gcs)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.core.config import settings


# ---------------------------------------------------------------------------
# _get_client
# ---------------------------------------------------------------------------


class TestGetClient:
    """Test the _get_client helper."""

    @patch("app.services.gcs.storage.Client")
    def test_uses_adc_when_no_key(self, mock_client_cls):
        """When gcs_service_account_key is empty, falls back to ADC."""
        with patch.object(settings, "gcs_service_account_key", ""):
            from app.services.gcs import _get_client
            _get_client()
            mock_client_cls.assert_called_once()

    @patch("app.services.gcs.storage.Client")
    def test_uses_sa_key_when_set(self, mock_client_cls):
        """When gcs_service_account_key is set, uses from_service_account_json."""
        with patch.object(settings, "gcs_service_account_key", "/path/to/key.json"):
            from app.services.gcs import _get_client
            _get_client()
            mock_client_cls.from_service_account_json.assert_called_once_with("/path/to/key.json")


# ---------------------------------------------------------------------------
# _get_or_create_bucket
# ---------------------------------------------------------------------------


class TestGetOrCreateBucket:
    """Test bucket creation / retrieval logic."""

    @patch("app.services.gcs._get_client")
    def test_returns_existing_bucket(self, mock_get_client):
        """If bucket exists, just return it."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        mock_bucket = MagicMock()
        mock_bucket.location = "ME-WEST1"
        mock_client.bucket.return_value = mock_bucket

        from app.services.gcs import _get_or_create_bucket
        result = _get_or_create_bucket(mock_client)

        mock_bucket.reload.assert_called_once()
        assert result is mock_bucket

    @patch("app.services.gcs._get_client")
    def test_creates_bucket_when_not_found(self, mock_get_client):
        """If bucket doesn't exist, create it in me-west1."""
        from google.api_core.exceptions import NotFound

        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        mock_bucket = MagicMock()
        mock_bucket.reload.side_effect = NotFound("Not found")
        mock_client.bucket.return_value = mock_bucket

        created_bucket = MagicMock()
        created_bucket.name = settings.gcs_bucket_name
        created_bucket.location = "ME-WEST1"
        created_bucket.storage_class = "STANDARD"
        mock_client.create_bucket.return_value = created_bucket

        from app.services.gcs import _get_or_create_bucket
        result = _get_or_create_bucket(mock_client)

        mock_client.create_bucket.assert_called_once_with(
            mock_bucket, location=settings.gcs_location,
        )
        assert result is created_bucket


# ---------------------------------------------------------------------------
# create_resumable_session
# ---------------------------------------------------------------------------


class TestCreateResumableSession:
    """Test the main create_resumable_session function."""

    @patch("app.services.gcs._get_or_create_bucket")
    @patch("app.services.gcs._get_client")
    def test_returns_session_uri_and_gcs_uri(
        self, mock_get_client, mock_get_bucket
    ):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        mock_bucket = MagicMock()
        mock_bucket.name = "test-bucket"
        mock_get_bucket.return_value = mock_bucket

        mock_blob = MagicMock()
        mock_blob.create_resumable_upload_session.return_value = (
            "https://storage.googleapis.com/upload/session-uri"
        )
        mock_bucket.blob.return_value = mock_blob

        from app.services.gcs import create_resumable_session

        session_uri, gcs_uri = create_resumable_session(
            project_id="proj-999",
            original_filename="doc.pdf",
            content_type="application/pdf",
        )

        assert session_uri == "https://storage.googleapis.com/upload/session-uri"
        # GCS URI should be: gs://test-bucket/proj-999/doc.pdf
        assert gcs_uri == "gs://test-bucket/proj-999/doc.pdf"

        # Verify blob path is project_id/filename (no UUID intermediary)
        mock_bucket.blob.assert_called_once_with("proj-999/doc.pdf")

        # Verify metadata was set
        assert mock_blob.metadata["project_id"] == "proj-999"
        assert mock_blob.metadata["original_filename"] == "doc.pdf"

    @patch("app.services.gcs._get_or_create_bucket")
    @patch("app.services.gcs._get_client")
    def test_strips_path_from_filename(self, mock_get_client, mock_get_bucket):
        """Filenames with path segments should be sanitised."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        mock_bucket = MagicMock()
        mock_bucket.name = "test-bucket"
        mock_get_bucket.return_value = mock_bucket

        mock_blob = MagicMock()
        mock_blob.create_resumable_upload_session.return_value = "https://example.com/session"
        mock_bucket.blob.return_value = mock_blob

        from app.services.gcs import create_resumable_session

        _, gcs_uri = create_resumable_session(
            project_id="proj-1",
            original_filename="../../../etc/passwd",
        )

        # Should only contain 'passwd', not the traversal path
        assert gcs_uri.endswith("/passwd")
        assert "../" not in gcs_uri

    @patch("app.services.gcs._get_or_create_bucket")
    @patch("app.services.gcs._get_client")
    def test_preserves_original_filename(self, mock_get_client, mock_get_bucket):
        """The original document name should be visible in the GCS path."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        mock_bucket = MagicMock()
        mock_bucket.name = "my-bucket"
        mock_get_bucket.return_value = mock_bucket

        mock_blob = MagicMock()
        mock_blob.create_resumable_upload_session.return_value = "https://example.com/session"
        mock_bucket.blob.return_value = mock_blob

        from app.services.gcs import create_resumable_session

        _, gcs_uri = create_resumable_session(
            project_id="abc-123",
            original_filename="נסח_טאבו_הרצל_15.pdf",
        )

        assert gcs_uri == "gs://my-bucket/abc-123/נסח_טאבו_הרצל_15.pdf"


# ---------------------------------------------------------------------------
# verify_gcs_connectivity
# ---------------------------------------------------------------------------


class TestVerifyConnectivity:
    """Test the health-check helper."""

    @patch("app.services.gcs._get_or_create_bucket")
    @patch("app.services.gcs._get_client")
    def test_returns_ok_when_healthy(self, mock_get_client, mock_get_bucket):
        mock_bucket = MagicMock()
        mock_bucket.name = "d-done"
        mock_bucket.location = "ME-WEST1"
        mock_get_bucket.return_value = mock_bucket

        from app.services.gcs import verify_gcs_connectivity

        result = verify_gcs_connectivity()
        assert result["status"] == "ok"
        assert result["bucket"] == "d-done"

    @patch("app.services.gcs._get_client")
    def test_returns_error_on_failure(self, mock_get_client):
        mock_get_client.side_effect = RuntimeError("No credentials")

        from app.services.gcs import verify_gcs_connectivity

        result = verify_gcs_connectivity()
        assert result["status"] == "error"
        assert "No credentials" in result["detail"]
