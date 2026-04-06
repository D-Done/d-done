"""Application settings loaded from environment variables."""

from pydantic import AliasChoices, Field, computed_field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ---- GCP ----
    gcp_project_id: str = ""

    # ---- GCS ----
    gcs_bucket_name: str = "d-done"
    # Bucket location — Israel region for data-residency compliance.
    gcs_location: str = "me-west1"
    # Origin to pass to GCS when creating resumable upload sessions.
    # GCS uses this to include CORS headers on PUT responses.
    # Set to the frontend URL (e.g. "https://d-done-theta.vercel.app").
    # If empty, the backend auto-detects from the request Origin header.
    gcs_upload_origin: str = ""
    # Path to a service-account JSON key.  Leave empty to use Application
    # Default Credentials (ADC) — recommended for Cloud Run / GKE.
    gcs_service_account_key: str = ""
    # Optional service account email used for IAM-based URL signing when
    # running on ADC without a local private key (e.g., Cloud Run).
    # If empty, we attempt to infer it from ADC.
    gcs_signing_service_account_email: str = ""

    # Signed-URL lifetime (seconds).  The frontend must start the resumable
    # session within this window.
    gcs_signed_url_expiry_seconds: int = 3600  # 1 hour

    # Maximum upload file size in bytes (default 100 MiB).
    max_upload_size_bytes: int = 100 * 1024 * 1024

    # Allowed MIME types for upload.
    allowed_content_types: list[str] = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/tiff",
    ]

    # ---- Database (PostgreSQL / Cloud SQL) ----
    # For Cloud SQL via proxy: postgresql://user:password@localhost:5432/d_done
    # For Cloud SQL via socket: postgresql://user:password@/d_done?host=/cloudsql/project:region:instance
    # Set to "sqlite:///./test.db" for local dev without PostgreSQL.
    database_url: str = "postgresql://postgres:postgres@localhost:5432/d_done"
    # If true, create DB tables on app startup (dev convenience).
    # In production this is typically handled by migrations and can block startup
    # if the DB is temporarily unreachable.
    db_init_on_startup: bool = False

    # ---- Auth ----
    # Descope project ID — required for session token validation.
    # Set DESCOPE_PROJECT_ID in .env.local or Cloud Run env.
    descope_project_id: str = ""

    # Backend session cookie lifetime in seconds (default 3 days).
    auth_session_expire_seconds: int = 259200

    # When AUTH_DISABLED=1 locally, optional email of user to impersonate.
    auth_dev_user_email: str = ""

    # Invite emails and absolute invite links (e.g. https://app.example.com).
    frontend_base_url: str = "http://localhost:3000"

    # Resend (https://resend.com) — API key and From address for transactional email.
    resend_api_key: str = ""
    email_from: str = ""

    # Comma-separated list of emails that are auto-approved and set as admin on first sign-up.
    # E.g. "you@example.com,partner@example.com"
    auth_admin_emails: str = ""

    # If true, skip auth checks (for local development only).
    # Read from env: AUTH_DISABLED (true/false).
    auth_disabled: bool = Field(
        default=False, description="Skip auth checks (local dev only)"
    )

    # ---- Document AI (DEPRECATED — DocAI flow removed, using VG pipeline only) ----
    document_ai_location: str = "eu"
    document_ai_processor_id: str = ""

    # ---- Gemini / AI Agent ----
    # Preferred mode: Vertex AI (ADC) using the google-genai library.
    # Gemini 3 models are available globally; keep this default unless you have
    # a specific Vertex AI location requirement.
    vertex_ai_location: str = "global"
    # Fallback mode: API-key auth via Google AI Studio.
    gemini_api_key: str = ""
    # Vertex model IDs (publisher models). Override per environment if needed.
    # Defaults match Vertex AI documentation model IDs.
    gemini_flash_model: str = "gemini-2.0-flash-001"
    gemini_pro_model: str = "gemini-3.1-pro-preview"

    # ---- CORS ----
    # Comma-separated origins in env (CORS_ORIGINS). pydantic-settings parses list[str] from env as
    # JSON only, so a value like "https://a.com,https://b.com" would crash startup — we store CSV.
    cors_origins_csv: str = Field(
        default="http://localhost:3000,https://d-done.com",
        validation_alias=AliasChoices("CORS_ORIGINS", "cors_origins_csv"),
        description="Comma-separated allowed browser origins for CORS",
    )

    @computed_field
    @property
    def cors_origins(self) -> list[str]:
        return [x.strip() for x in self.cors_origins_csv.split(",") if x.strip()]

    model_config = {
        "env_file": ".env.local",
        "env_file_encoding": "utf-8",
        # Silently ignore unknown env vars (e.g. GOOGLE_CLOUD_PROJECT,
        # GOOGLE_GENAI_USE_VERTEXAI, EVAL_* used by the eval harness).
        "extra": "ignore",
    }


settings = Settings()
