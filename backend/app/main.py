"""FastAPI application entry point.

Database migrations are handled by Alembic and run from ``entrypoint.sh``
*before* uvicorn starts — the app no longer touches the schema at runtime.
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.upload import router as upload_router
from app.api.projects import router as projects_router
from app.api.analysis import router as analysis_router
from app.api.settings import router as settings_router
from app.api.auth import router as auth_router
from app.api.bbox_lab import router as bbox_lab_router
from app.api.admin import router as admin_router
from app.api.organization import router as organization_router
from app.api.invites import router as invites_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# On Cloud Run, send Python logs to Cloud Logging with correct severity (so ERROR triggers your alert)
if os.environ.get("K_SERVICE"):
    try:
        from google.cloud import logging as gcp_logging
        gcp_logging.Client().setup_logging(log_level=logging.INFO)
        logger.info("Cloud Logging handler attached (severity will be preserved)")
    except Exception as e:
        logger.warning("Cloud Logging setup skipped: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    from app.agents.session_store import close_session_service

    await close_session_service()


_docs = None if os.environ.get("K_SERVICE") else "/docs"
_redoc = None if os.environ.get("K_SERVICE") else "/redoc"
_openapi = None if os.environ.get("K_SERVICE") else "/openapi.json"

app = FastAPI(
    title="D-Done API",
    description="AI Due Diligence platform for Israeli Real Estate",
    version="0.3.0",
    lifespan=lifespan,
    docs_url=_docs,
    redoc_url=_redoc,
    openapi_url=_openapi,
)

# ---- CORS ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return response

# ---- Routers ----
app.include_router(auth_router, prefix="/api/v1")
app.include_router(invites_router, prefix="/api/v1")
app.include_router(projects_router, prefix="/api/v1")
app.include_router(upload_router, prefix="/api/v1")
app.include_router(analysis_router, prefix="/api/v1")
app.include_router(settings_router, prefix="/api/v1")
app.include_router(bbox_lab_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(organization_router, prefix="/api/v1")


# ---- Health ----
@app.get("/health")
async def health():
    return {"status": "ok"}
