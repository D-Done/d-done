"""Google Cloud Storage helpers for resumable uploads.

Flow
----
1.  Backend calls `create_resumable_session` → initiates a resumable upload
    on GCS and returns the *session URI* directly.
2.  Frontend uploads file chunks to the session URI via PUT with
    Content-Range headers (see `gcs-upload.ts` on the client).
3.  The session URI is self-authenticating — no signing or credentials needed
    on the client side.

Region
------
All buckets are created in **me-west1** (Tel Aviv) for data-residency
compliance with Israeli real-estate due-diligence regulations.

Naming
------
Files are stored at: ``gs://<bucket>/<project_id>/<original_filename>``
The original filename is preserved so lawyers can identify documents in
the UI.
"""

from __future__ import annotations

import logging
import os
from datetime import timedelta
from pathlib import PurePosixPath

from google.cloud import storage
from google.api_core import exceptions as gcs_exceptions
from google.auth.transport.requests import Request as AuthRequest
import google.auth

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Client / bucket helpers
# ---------------------------------------------------------------------------


def _get_client() -> storage.Client:
    """Build a GCS client, optionally from a service-account key file."""
    if settings.gcs_service_account_key:
        return storage.Client.from_service_account_json(
            settings.gcs_service_account_key
        )
    # Falls back to Application Default Credentials (ADC)
    return storage.Client(project=settings.gcp_project_id or None)


def _get_or_create_bucket(client: storage.Client) -> storage.Bucket:
    """Return the configured bucket, creating it in *me-west1* if needed.

    The bucket is created with:
    - Location: ``settings.gcs_location`` (default ``me-west1``)
    - Storage class: ``STANDARD``
    - Uniform bucket-level access enabled (recommended by Google)

    Raises
    ------
    google.api_core.exceptions.GoogleAPIError
        If the bucket cannot be created or accessed.
    """
    bucket_name = settings.gcs_bucket_name
    location = settings.gcs_location

    bucket = client.bucket(bucket_name)

    try:
        bucket.reload()  # Check if bucket exists
        logger.debug("Bucket %s already exists in %s", bucket_name, bucket.location)
        _ensure_bucket_cors(bucket)
        return bucket
    except gcs_exceptions.NotFound:
        logger.info(
            "Bucket %s not found — creating in %s",
            bucket_name,
            location,
        )
    except gcs_exceptions.Forbidden:
        # Bucket exists but we lack metadata access — fine, we can still
        # create blobs if the SA has objectCreator permissions.
        logger.warning(
            "Cannot read metadata for bucket %s (403). Proceeding assuming it exists.",
            bucket_name,
        )
        return bucket

    # Create the bucket in the configured region
    bucket.storage_class = "STANDARD"
    bucket.iam_configuration.uniform_bucket_level_access_enabled = True
    try:
        bucket = client.create_bucket(bucket, location=location)
        logger.info(
            "Created bucket %s in %s (storage class: %s)",
            bucket.name,
            bucket.location,
            bucket.storage_class,
        )
    except gcs_exceptions.Conflict:
        # Race condition: another process created it between our check and create
        logger.info("Bucket %s already exists (conflict on create).", bucket_name)
        bucket = client.bucket(bucket_name)

    _ensure_bucket_cors(bucket)
    return bucket


def _ensure_bucket_cors(bucket: storage.Bucket) -> None:
    """Best-effort ensure bucket CORS allows browser resumable uploads.

    Without bucket CORS, browsers will fail the preflight OPTIONS request to
    the GCS resumable session URL, and XHR will surface it as a generic
    "Network error during upload".

    We configure origins based on the backend CORS origins (frontend URLs).
    If the caller doesn't have permission to update bucket metadata, we log
    and continue.
    """
    try:
        origins = [
            o.rstrip("/") for o in (settings.cors_origins or []) if isinstance(o, str)
        ]
        # For signed URLs, access is already bearer-based. Allowing '*' here is safe and
        # avoids brittle deploy-domain mismatches that break PDF.js (CORS + Range).
        if "*" not in origins:
            origins = ["*", *origins] if origins else ["*"]

        desired_rule = {
            "origin": origins,
            "method": ["PUT", "POST", "GET", "HEAD", "OPTIONS"],
            # Headers we need to read from GCS responses (Range is important for resumable resume).
            "responseHeader": [
                "Content-Type",
                "Content-Range",
                "Range",
                "x-goog-resumable",
                "x-goog-generation",
                "x-goog-hash",
                "x-goog-stored-content-length",
                "x-goog-stored-content-encoding",
                "Location",
                # Some browsers include these in preflight allow-headers.
                "x-client-data",
                "sec-ch-ua",
                "sec-ch-ua-mobile",
                "sec-ch-ua-platform",
                # Upload-related headers (defensive; different clients use them).
                "x-goog-upload-command",
                "x-goog-upload-offset",
                "x-goog-upload-protocol",
                "x-goog-upload-status",
                "x-goog-upload-size",
            ],
            "maxAgeSeconds": 3600,
        }

        current = bucket.cors or []
        if current == [desired_rule]:
            return

        bucket.cors = [desired_rule]
        bucket.patch()
        logger.info(
            "Configured bucket CORS for browser uploads (bucket=%s)", bucket.name
        )
    except Exception as exc:
        logger.warning(
            "Could not configure bucket CORS (bucket=%s): %s", bucket.name, exc
        )


def verify_gcs_connectivity() -> dict:
    """Verify that GCS is reachable and the bucket is accessible.

    Returns a dict with status information, suitable for a health-check
    endpoint.
    """
    try:
        client = _get_client()
        bucket = _get_or_create_bucket(client)
        return {
            "status": "ok",
            "bucket": bucket.name,
            "location": getattr(bucket, "location", settings.gcs_location),
        }
    except Exception as exc:
        logger.error("GCS connectivity check failed: %s", exc)
        return {
            "status": "error",
            "detail": str(exc),
        }


# ---------------------------------------------------------------------------
# Resumable upload session
# ---------------------------------------------------------------------------


def create_resumable_session(
    *,
    project_id: str,
    original_filename: str,
    content_type: str = "application/pdf",
    origin: str | None = None,
) -> tuple[str, str]:
    """Initiate a GCS resumable upload session and return the session URI.

    Files are stored at ``gs://<bucket>/<project_id>/<original_filename>``
    so the original document name is preserved and visible to lawyers.

    The backend creates the session (authenticated with ADC or SA key),
    and the frontend uploads directly to the session URI — no signed URL
    or client-side credentials needed.

    The bucket is auto-created in ``me-west1`` if it does not yet exist.

    Returns
    -------
    (session_uri, gcs_uri)
        session_uri – The URL the client should PUT chunks to.
        gcs_uri     – Full GCS URI: ``gs://bucket/project_id/filename``.
    """
    client = _get_client()
    bucket = _get_or_create_bucket(client)

    # Preserve the original filename (lawyers need to see it in the UI).
    # Only strip directory traversal — keep the actual file name.
    safe_name = PurePosixPath(original_filename).name
    object_name = f"{project_id}/{safe_name}"

    blob = bucket.blob(object_name)

    # Metadata: store the originating project for traceability
    blob.metadata = {
        "project_id": project_id,
        "original_filename": safe_name,
    }

    # create_resumable_upload_session uses the backend's credentials to
    # initiate the session on GCS, and returns a session URI that the
    # client can upload to without any credentials.
    session_uri = blob.create_resumable_upload_session(
        content_type=content_type,
        # IMPORTANT: When using resumable sessions from browsers, we must pass
        # the requesting Origin here. Otherwise, the subsequent PUT responses
        # may omit CORS headers (causing XHR/fetch to surface "CORS error"
        # even when the request succeeded server-side).
        origin=origin,
    )

    gcs_uri = f"gs://{bucket.name}/{object_name}"

    logger.info(
        "Created resumable session for %s (project=%s, bucket=%s, location=%s)",
        gcs_uri,
        project_id,
        bucket.name,
        settings.gcs_location,
    )

    return session_uri, gcs_uri


# ---------------------------------------------------------------------------
# Signed URLs (view/download)
# ---------------------------------------------------------------------------


def _parse_gcs_uri(gcs_uri: str) -> tuple[str, str]:
    """Parse `gs://bucket/object` into (bucket, object)."""
    raw = (gcs_uri or "").strip()
    if not raw.startswith("gs://"):
        raise ValueError(f"Invalid GCS URI: {gcs_uri!r}")
    rest = raw[len("gs://") :]
    if "/" not in rest:
        raise ValueError(f"Invalid GCS URI (missing object path): {gcs_uri!r}")
    bucket, object_name = rest.split("/", 1)
    if not bucket or not object_name:
        raise ValueError(f"Invalid GCS URI: {gcs_uri!r}")
    return bucket, object_name


def move_blob(source_gcs_uri: str, dest_gcs_uri: str) -> str:
    """Move (copy + delete) a blob from source to destination within the same bucket.

    Use this after document classification to reorganize files into
    ``gs://<bucket>/<project_id>/<doc_type>/<filename>``.

    Returns
    -------
    str
        The destination GCS URI (same as dest_gcs_uri).
    """
    client = _get_client()
    src_bucket_name, src_object = _parse_gcs_uri(source_gcs_uri)
    dest_bucket_name, dest_object = _parse_gcs_uri(dest_gcs_uri)

    if src_bucket_name != dest_bucket_name:
        raise ValueError(
            f"move_blob only supports same-bucket moves; got {src_bucket_name} -> {dest_bucket_name}"
        )

    bucket = client.bucket(src_bucket_name)
    src_blob = bucket.blob(src_object)
    dest_blob = bucket.copy_blob(src_blob, bucket, dest_object)
    src_blob.delete()

    result_uri = f"gs://{dest_bucket_name}/{dest_object}"
    logger.info("Moved blob %s -> %s", source_gcs_uri, result_uri)
    return result_uri


def delete_project_folder(project_id: str) -> int:
    """Delete all GCS blobs under ``<bucket>/<project_id>/``.

    Returns the number of blobs deleted.
    Errors on individual blobs are logged and skipped so the caller can
    still proceed with the DB delete.
    """
    client = _get_client()
    bucket = client.bucket(settings.gcs_bucket_name)
    prefix = f"{project_id}/"

    blobs = list(client.list_blobs(bucket, prefix=prefix))
    deleted = 0
    for blob in blobs:
        try:
            blob.delete()
            deleted += 1
        except gcs_exceptions.NotFound:
            pass
        except Exception as exc:
            logger.warning("Could not delete GCS blob %s: %s", blob.name, exc)

    logger.info(
        "Deleted %d GCS blob(s) for project %s (prefix=%s)",
        deleted,
        project_id,
        prefix,
    )
    return deleted


def generate_signed_view_url(
    *,
    gcs_uri: str,
    filename: str | None = None,
    content_type: str = "application/pdf",
    expires_in_seconds: int | None = None,
) -> tuple[str, int]:
    """Generate a short-lived signed GET URL for viewing a file in the browser."""
    client = _get_client()
    bucket_name, object_name = _parse_gcs_uri(gcs_uri)
    bucket = client.bucket(bucket_name)
    # Ensure CORS is set for PDF.js-style fetches (Range/CORS).
    # Best-effort: if we lack bucket metadata permissions, we just log and continue.
    _ensure_bucket_cors(bucket)
    blob = bucket.blob(object_name)

    safe_name = PurePosixPath(filename or PurePosixPath(object_name).name).name
    exp = int(expires_in_seconds or settings.gcs_signed_url_expiry_seconds or 3600)
    exp = max(60, min(exp, 24 * 3600))

    # Cloud Run / ADC-friendly signing (no local private key):
    # Use the IAMCredentials signBlob flow by passing service_account_email + access_token.
    #
    # This requires:
    # - `iamcredentials.googleapis.com` enabled
    # - caller principal has `iam.serviceAccounts.signBlob` on that service account
    service_account_email = (
        (settings.gcs_signing_service_account_email or "").strip()
        or (os.environ.get("GCS_SIGNING_SERVICE_ACCOUNT_EMAIL") or "").strip()
        or None
    )

    try:
        adc_creds, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        # Ensure fresh token
        if not getattr(adc_creds, "token", None) or getattr(
            adc_creds, "expired", False
        ):
            adc_creds.refresh(AuthRequest())
        access_token = getattr(adc_creds, "token", None)

        # If env var isn't set, attempt to infer from ADC (works for some SA cred types)
        if not service_account_email:
            service_account_email = getattr(
                adc_creds, "service_account_email", None
            ) or getattr(adc_creds, "signer_email", None)

        # Fallback: try storage client's credentials (can differ from google.auth.default())
        if not access_token:
            try:
                client_creds = getattr(client, "_credentials", None)
                if client_creds is not None and (
                    not getattr(client_creds, "token", None)
                    or getattr(client_creds, "expired", False)
                ):
                    client_creds.refresh(AuthRequest())
                access_token = getattr(client_creds, "token", None) or access_token
            except Exception:
                pass

        logger.info(
            "Signed URL auth: adc_creds=%s token=%s email=%s",
            type(adc_creds).__name__,
            "yes" if access_token else "no",
            service_account_email or "(missing)",
        )

        if not service_account_email or not access_token:
            raise RuntimeError(
                "ADC did not provide service_account_email/access_token for IAM signing. "
                "Set GCS_SIGNING_SERVICE_ACCOUNT_EMAIL and ensure ADC is available."
            )

        url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(seconds=exp),
            method="GET",
            response_type=content_type,
            response_disposition=f'inline; filename="{safe_name}"',
            service_account_email=service_account_email,
            access_token=access_token,
        )
    except Exception as exc:
        hint = (
            "Failed to sign via ADC/IAM. Ensure: "
            "`iamcredentials.googleapis.com` enabled, and the runtime service account has "
            "`roles/iam.serviceAccountTokenCreator` (or `iam.serviceAccounts.signBlob`) on the "
            f"service account `{service_account_email or 'GCS_SIGNING_SERVICE_ACCOUNT_EMAIL'}`."
        )
        raise RuntimeError(f"{exc}. {hint}") from exc

    return url, exp
