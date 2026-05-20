"""Analysis endpoints — trigger DD checks and retrieve results.

The analysis runs within the request using native ``async def`` endpoints so
that all ADK agent calls share a single event loop (no ``asyncio.run()``).

Sync read-only endpoints (``get_results``, ``get_check_result``) keep the
traditional ``Session`` dependency since they don't call agents.

Citation architecture:
- Extractors receive raw PDF URIs via ``Part.from_uri``; Gemini reads them natively.
- DocAI outputs are preloaded into session state for the citation resolver.
- The citation resolver agent enriches the report with bounding-box coordinates
  using semantic embeddings, with fallback to exact/fuzzy matching.
- On citation click the frontend serves signed URL + polygons from the stored
  report (no DocAI or GCS read at view time).
"""

from __future__ import annotations


import asyncio
import logging
import traceback
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from pathlib import PurePosixPath
from uuid import UUID, uuid4

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
import re

from app.core.auth import CurrentUser, get_approved_user
from app.core.authorization import (
    require_project_access,
    require_project_access_async,
    require_project_owner_async,
)
from app.core.config import settings
from app.db.session import get_async_db, get_db
from app.db.models import DDCheck, File, Organization, Project


from app.services.failure_logging import log_analysis_failure
from app.services.email import send_report_ready_notification

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["analysis"])

# Tracks all live analysis asyncio.Tasks so lifespan shutdown can cancel them gracefully.
_running_analysis_tasks: set[asyncio.Task] = set()

# Pipeline stages reported to the frontend (when status is "processing")
PIPELINE_STAGE_DOC_PROCESSING = "doc_processing"
PIPELINE_STAGE_EXTRACTION = "extraction"
PIPELINE_STAGE_SYNTHESIS = "synthesis"
PIPELINE_STAGE_CITATION_LOCATING = "citation_locating"
PIPELINE_STAGE_HITL_TENANT_REVIEW = "hitl_tenant_review"


async def _set_pipeline_stage(
    db: AsyncSession, project_id: UUID, stage: str | None
) -> None:
    """Update project.pipeline_stage for polling UI. Caller should have ownership."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project:
        project.pipeline_stage = stage
        await db.commit()


def _format_error_message(exc: ExceptionGroup | Exception) -> str:
    """Format exception message; for ExceptionGroup include all sub-exceptions."""
    if isinstance(exc, ExceptionGroup):
        parts = [str(exc)]
        for i, sub in enumerate(exc.exceptions):
            parts.append(f"Sub-exception [{i + 1}]: {sub!s}")
        return "\n".join(parts)
    return str(exc)


async def _handle_analysis_failure(
    exc: ExceptionGroup | Exception,
    *,
    check_id: UUID,
    project_id: UUID,
    db: AsyncSession,
    user_email: str,
) -> None:
    """Update DB to failed and log at ERROR for GCP (logging only)."""
    logger.exception("DD analysis failed: check_id=%s", check_id)

    result = await db.execute(select(DDCheck).where(DDCheck.id == check_id))
    dd_check = result.scalar_one_or_none()
    if dd_check:
        dd_check.status = "failed"
        dd_check.error_message = _format_error_message(exc)[:2000]
        dd_check.completed_at = datetime.now(timezone.utc)

    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project:
        project.status = "failed"
        project.pipeline_stage = None

    await db.commit()

    log_analysis_failure(
        project_id=str(project_id),
        check_id=str(check_id),
        user_email=user_email,
        error_message=_format_error_message(exc)[:2000],
        project_title=project.title if project else None,
        traceback_str=traceback.format_exc(),
    )


_MANDATORY_DOCS_FINANCE: list[tuple[str, list[str]]] = [
    ("הסכם פרויקט", ["הסכם פרויקט"]),
    ('דו"ח אפס', ['דו"ח אפס', "דוח אפס"]),
    ("ועדת אשראי", ["ועדת אשראי"]),
    ("מסמכי חברה", ["נסח חברה", "תעודת התאגדות", "תדפיס רשם החברות"]),
    ("נסח טאבו", ["נסח טאבו"]),
    ("פרוטוקול מורשה חתימה", ["פרוטוקול מורשה חתימה", "פרוטוקול מורשי חתימה"]),
]


def _normalize_filename(name: str) -> str:
    base = name.rsplit("/", 1)[-1]
    base = re.sub(r"\.(pdf|PDF)$", "", base).strip()
    base = re.sub(r"\s+", " ", base)
    return base


def _validate_mandatory_docs_for_finance(uploaded_files: list[File]) -> list[str]:
    """Return missing mandatory doc display names (Hebrew) for finance DD.

    Checks filenames against known stems. Informational only — the pipeline
    tolerates missing documents.
    """
    available = {_normalize_filename(f.original_name) for f in uploaded_files}

    missing: list[str] = []
    for display_name, acceptable_stems in _MANDATORY_DOCS_FINANCE:
        if not any(
            any(a.startswith(stem) for a in available) for stem in acceptable_stems
        ):
            missing.append(display_name)

    return missing


# ---- Response models ----


MAX_QA_RETRIES_DEFAULT = 1
MAX_QA_RETRIES_LIMIT = 3


class QAScoreItem(BaseModel):
    criterion_id: str
    criterion_name: str
    passed: bool
    confidence: float
    reasoning: str


class QASummary(BaseModel):
    """QA layer results included in the analysis response."""

    is_approved: bool
    scores: list[QAScoreItem] = []
    corrections_he: list[str] = []


class AnalyzeResponse(BaseModel):
    check_id: str
    status: str
    report: dict | None = None
    qa_summary: QASummary | None = None
    qa_attempts: int = 1
    error_message: str | None = None


class AnalyzeRequest(BaseModel):
    """Optional analysis options supplied by the frontend."""

    deal_type: str | None = None
    real_estate_type: str | None = None
    custom_prompt: str | None = None
    max_qa_retries: int | None = None
    use_visual_grounding: bool = False
    optional_chapters: list[str] | None = None


class TenantTableApproval(BaseModel):
    """Approved or user-edited tenant records for HITL Phase 2."""

    tenant_records: list[dict] = Field(
        default_factory=list,
        description="Tenant records (sub_parcel, owner_name, is_signed, date_signed, etc.)",
    )
    correction_prompt: str | None = Field(
        default=None,
        description="If set, re-run main synthesis with this correction instead of proceeding to Phase 2.",
    )


class DDReportResponse(BaseModel):
    """Full DD report for a project."""

    check_id: str
    project_id: str
    status: str
    report: dict | None = None
    error_message: str | None = None
    started_at: str | None = None
    completed_at: str | None = None


class CitationViewResponse(BaseModel):
    """Signed URL + precomputed polygons for a single citation (serve on click)."""

    view_url: str
    expires_in_seconds: int
    page_number: int
    bounding_boxes: list[dict]
    document_name: str


class AgentSessionEventsResponse(BaseModel):
    """Persisted ADK session events for a DD check."""

    agent_session_id: str | None = None
    judge_session_id: str | None = None
    agent_events: list[dict] = Field(default_factory=list)
    judge_events: list[dict] = Field(default_factory=list)


# ---- Checklist auto-generation ----


async def _auto_populate_ma_checklist(
    db: AsyncSession,
    project_id: UUID,
    check_id: UUID,
    report_dict: dict,
) -> None:
    """Sync M&A completeness items into the checklist_items table."""
    try:
        from sqlalchemy import delete as sa_delete
        from app.db.models import ChecklistItem

        completeness = report_dict.get("completeness") or {}
        items = completeness.get("items") or []

        # Also collect per-chapter follow_ups not already in completeness
        follow_up_ids_in_completeness = {it.get("id") for it in items}
        for chapter in report_dict.get("chapters") or []:
            for fu in chapter.get("follow_ups") or []:
                fu_id = fu.get("id", "")
                if fu_id not in follow_up_ids_in_completeness:
                    items.append({
                        "id": fu_id,
                        "description": fu.get("description", ""),
                        "severity": fu.get("severity", "info"),
                        "suggested_document": fu.get("suggested_document"),
                        "chapter_ids": [chapter.get("chapter_id", "")],
                    })
                    follow_up_ids_in_completeness.add(fu_id)

        if not items:
            return

        _SEVERITY_TO_CATEGORY = {
            "critical": "missing_doc",
            "warning": "warning_note",
            "info": "other",
        }

        await db.execute(
            sa_delete(ChecklistItem).where(
                ChecklistItem.project_id == project_id,
                ChecklistItem.is_completed == False,
            )
        )

        for i, item in enumerate(items):
            severity = item.get("severity") or "info"
            title = (item.get("description") or "").strip()[:500]
            if not title:
                continue
            db.add(ChecklistItem(
                project_id=project_id,
                check_id=check_id,
                category=_SEVERITY_TO_CATEGORY.get(severity, "other"),
                title=title,
                description=(item.get("suggested_document") or None),
                sort_order=i,
            ))

        await db.commit()
        logger.info("Auto-populated %d MA checklist items for project %s", len(items), project_id)
    except Exception as exc:
        logger.error("MA checklist population failed for project %s: %s", project_id, exc, exc_info=True)


async def _auto_generate_checklist(
    db: AsyncSession,
    project_id: UUID,
    check_id: UUID,
    report_dict: dict,
    language: str = "he",
) -> None:
    """Generate and persist checklist items right after a finance DD report completes."""
    try:
        from app.agents.schemas import RealEstateFinanceDDReport
        from app.db.models import ChecklistItem
        from app.services.checklist_generator import generate_checklist_items

        report = RealEstateFinanceDDReport.model_validate(report_dict)

        # Run blocking Gemini call in a thread
        import asyncio
        new_items_list = await asyncio.to_thread(generate_checklist_items, report, language)

        # Delete any uncompleted items from a previous run
        from sqlalchemy import delete as sa_delete
        await db.execute(
            sa_delete(ChecklistItem).where(
                ChecklistItem.project_id == project_id,
                ChecklistItem.is_completed == False,
            )
        )

        for item_data in new_items_list:
            db.add(ChecklistItem(
                project_id=project_id,
                check_id=check_id,
                category=item_data.get("category", "other"),
                title=item_data.get("title", "")[:500],
                description=(item_data.get("description") or "")[:2000] or None,
                sort_order=item_data.get("sort_order", 0),
            ))

        await db.commit()
        logger.info("Auto-generated %d checklist items for project %s", len(new_items_list), project_id)
    except Exception as exc:
        logger.error("Auto-checklist generation failed for project %s: %s", project_id, exc, exc_info=True)


# ---- Endpoints ----


async def _run_analysis_task(
    *,
    check_id: UUID,
    project_id: UUID,
    uploaded_files: list,
    transaction_type: str,
    transaction_metadata: dict,
    user_email: str,
    language: str = "he",
    optional_chapters: list[str] | None = None,
) -> None:
    """Background coroutine that runs the full pipeline with its own DB session.

    Fired via ``asyncio.create_task()`` so the HTTP response is returned
    immediately and the Cloud Run request timeout does not apply.
    """
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:

        async def on_stage_change(stage: str) -> None:
            await _set_pipeline_stage(db, project_id, stage)

        try:
            if transaction_type == "ma":
                analysis_result = await _run_ma_analysis(
                    project_id=project_id,
                    uploaded_files=uploaded_files,
                    transaction_metadata=transaction_metadata,
                    on_stage_change=on_stage_change,
                    optional_chapters=optional_chapters,
                )
            else:
                analysis_result = await _run_analysis(
                    project_id=project_id,
                    uploaded_files=uploaded_files,
                    on_stage_change=on_stage_change,
                    use_visual_grounding=True,
                    phase1_only=True,
                    transaction_metadata=transaction_metadata,
                    language=language,
                )

            if analysis_result.needs_review and analysis_result.hitl_data is not None:
                result = await db.execute(select(DDCheck).where(DDCheck.id == check_id))
                dd_check = result.scalar_one()
                dd_check.status = "needs_review"
                dd_check.agent_session_id = analysis_result.agent_session_id
                dd_check.hitl_data = analysis_result.hitl_data
                dd_check.prompt_tokens = analysis_result.prompt_tokens
                dd_check.completion_tokens = analysis_result.completion_tokens
                dd_check.total_tokens = analysis_result.total_tokens

                result = await db.execute(select(Project).where(Project.id == project_id))
                project_row = result.scalar_one()
                project_row.status = "needs_review"
                project_row.pipeline_stage = PIPELINE_STAGE_HITL_TENANT_REVIEW

                await db.commit()
                logger.info(
                    "DD analysis Phase 1 complete, awaiting tenant table review: check_id=%s",
                    check_id,
                )
                project_url = f"{settings.frontend_base_url.rstrip('/')}/transactions/{project_id}"
                send_report_ready_notification(
                    to_email=user_email,
                    project_name=project_row.title,
                    project_url=project_url,
                    needs_hitl_review=True,
                )
                return

            result = await db.execute(select(DDCheck).where(DDCheck.id == check_id))
            dd_check = result.scalar_one()
            dd_check.status = "completed"
            dd_check.report = analysis_result.report_dict
            dd_check.agent_session_id = analysis_result.agent_session_id
            dd_check.completed_at = datetime.now(timezone.utc)
            dd_check.prompt_tokens = analysis_result.prompt_tokens
            dd_check.completion_tokens = analysis_result.completion_tokens
            dd_check.total_tokens = analysis_result.total_tokens

            result = await db.execute(select(Project).where(Project.id == project_id))
            project = result.scalar_one()
            project.status = "completed"
            project.pipeline_stage = None

            await db.commit()
            logger.info("DD analysis completed: check_id=%s, tokens=%d", check_id, analysis_result.total_tokens)

            # Auto-generate completeness checklist for finance projects
            if "tenant_table" in (analysis_result.report_dict or {}):
                await _auto_generate_checklist(db, project_id, check_id, analysis_result.report_dict, language=language)

            # Auto-populate completeness checklist for M&A projects
            if transaction_type == "ma":
                await _auto_populate_ma_checklist(db, project_id, check_id, analysis_result.report_dict)

            project_url = f"{settings.frontend_base_url.rstrip('/')}/transactions/{project_id}"
            send_report_ready_notification(
                to_email=user_email,
                project_name=project.title,
                project_url=project_url,
                needs_hitl_review=False,
            )

        except asyncio.CancelledError:
            # Cloud Run sent SIGTERM — mark as failed so the user can re-run.
            logger.warning("Analysis task cancelled (instance shutdown): check_id=%s", check_id)
            try:
                result = await db.execute(select(DDCheck).where(DDCheck.id == check_id))
                dd_check = result.scalar_one_or_none()
                if dd_check and dd_check.status == "processing":
                    dd_check.status = "failed"
                    dd_check.error_message = "ניתוח הופסק עקב הפסקת שרת — אנא הרץ מחדש"
                    dd_check.completed_at = datetime.now(timezone.utc)
                result = await db.execute(select(Project).where(Project.id == project_id))
                project = result.scalar_one_or_none()
                if project and project.status == "processing":
                    project.status = "failed"
                    project.pipeline_stage = None
                await db.commit()
            except Exception:
                pass  # DB may be unavailable during shutdown; best effort
            raise
        except ExceptionGroup as eg:
            await _handle_analysis_failure(
                eg, check_id=check_id, project_id=project_id, db=db, user_email=user_email
            )
        except Exception as exc:
            await _handle_analysis_failure(
                exc, check_id=check_id, project_id=project_id, db=db, user_email=user_email
            )


async def _run_phase2_task(
    *,
    check_id: UUID,
    project_id: UUID,
    session_id: str,
    approved_records: list[dict],
    user_email: str,
    project_title: str,
) -> None:
    """Background coroutine for Phase 2 synthesis — mirrors _run_analysis_task.

    Fired via asyncio.create_task() so approve_tenant_table returns 202
    immediately. The HTTP connection can be dropped without killing Phase 2.
    """
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            analysis_result = await _run_analysis_phase2(
                session_id=session_id,
                approved_tenant_records=approved_records,
            )

            _apply_hitl_tenant_overrides(analysis_result.report_dict, approved_records)

            result = await db.execute(select(DDCheck).where(DDCheck.id == check_id))
            dd_check = result.scalar_one()
            dd_check.status = "completed"
            dd_check.report = analysis_result.report_dict
            dd_check.hitl_data = None
            dd_check.completed_at = datetime.now(timezone.utc)
            dd_check.prompt_tokens = (dd_check.prompt_tokens or 0) + analysis_result.prompt_tokens
            dd_check.completion_tokens = (dd_check.completion_tokens or 0) + analysis_result.completion_tokens
            dd_check.total_tokens = (dd_check.total_tokens or 0) + analysis_result.total_tokens

            result = await db.execute(select(Project).where(Project.id == project_id))
            project = result.scalar_one()
            project.status = "completed"
            project.pipeline_stage = None

            await db.commit()
            logger.info("DD Phase 2 completed: check_id=%s", check_id)

            project_url = f"{settings.frontend_base_url.rstrip('/')}/transactions/{project_id}"
            send_report_ready_notification(
                to_email=user_email,
                project_name=project_title,
                project_url=project_url,
                needs_hitl_review=False,
            )

        except asyncio.CancelledError:
            logger.warning("Phase 2 task cancelled (instance shutdown): check_id=%s", check_id)
            try:
                result = await db.execute(select(DDCheck).where(DDCheck.id == check_id))
                dd_check = result.scalar_one_or_none()
                if dd_check and dd_check.status == "processing":
                    dd_check.status = "failed"
                    dd_check.error_message = "שלב 2 הופסק עקב הפסקת שרת — אנא אשר שוב"
                    dd_check.completed_at = datetime.now(timezone.utc)
                result = await db.execute(select(Project).where(Project.id == project_id))
                project = result.scalar_one_or_none()
                if project and project.status == "processing":
                    project.status = "failed"
                    project.pipeline_stage = None
                await db.commit()
            except Exception:
                pass
            raise
        except ExceptionGroup as eg:
            await _handle_analysis_failure(
                eg, check_id=check_id, project_id=project_id, db=db, user_email=user_email
            )
        except Exception as exc:
            await _handle_analysis_failure(
                exc, check_id=check_id, project_id=project_id, db=db, user_email=user_email
            )


@router.post("/{project_id}/analyze", response_model=AnalyzeResponse)
async def start_analysis(
    project_id: UUID,
    body: AnalyzeRequest | None = Body(default=None),
    user: CurrentUser = Depends(get_approved_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Trigger a DD analysis for a project.

    Returns 202 immediately and runs the pipeline as a background asyncio task
    so the HTTP connection is not held open for the duration of the analysis.
    The frontend polls GET /projects/{id} for status updates.
    """
    # --- Verify project (owner only) ---
    project = await require_project_owner_async(db, user.id, project_id)

    # --- Verify files exist ---
    result = await db.execute(
        select(File).where(
            File.project_id == project_id, File.upload_status == "uploaded"
        )
    )
    uploaded_files = list(result.scalars().all())
    if not uploaded_files:
        raise HTTPException(
            status_code=400,
            detail="No uploaded files found. Upload documents before analyzing.",
        )

    # --- Check if there's already a check in progress ---
    result = await db.execute(
        select(DDCheck).where(
            DDCheck.project_id == project_id,
            DDCheck.status.in_(["pending", "processing"]),
        )
    )
    existing_check = result.scalar_one_or_none()
    if existing_check:
        raise HTTPException(
            status_code=409,
            detail="An analysis is already in progress for this project.",
        )

    # --- Create DD check record ---
    dd_check = DDCheck(
        project_id=project_id,
        status="processing",
        started_at=datetime.now(timezone.utc),
    )
    db.add(dd_check)
    project.status = "processing"
    await db.commit()
    await db.refresh(dd_check)

    check_id = dd_check.id
    transaction_type = project.transaction_type or "real_estate_finance"
    transaction_metadata = project.transaction_metadata or {}

    from app.core.authorization import DEFAULT_ORGANIZATION_ID
    org_id = user.organization_id or DEFAULT_ORGANIZATION_ID
    org_result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = org_result.scalar_one_or_none()
    language = (org.language if org else None) or "he"

    logger.info(
        "Starting DD analysis (async): check_id=%s, project=%s, files=%d, user=%s, language=%s",
        check_id,
        project_id,
        len(uploaded_files),
        user.email,
        language,
    )

    task = asyncio.create_task(
        _run_analysis_task(
            check_id=check_id,
            project_id=project_id,
            uploaded_files=uploaded_files,
            transaction_type=transaction_type,
            transaction_metadata=transaction_metadata,
            user_email=user.email,
            language=language,
            optional_chapters=body.optional_chapters if body else None,
        )
    )
    _running_analysis_tasks.add(task)
    task.add_done_callback(_running_analysis_tasks.discard)

    return AnalyzeResponse(
        check_id=str(check_id),
        status="processing",
        report=None,
    )


@router.get("/{project_id}/results", response_model=DDReportResponse)
def get_results(
    project_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Get the latest DD analysis results for a project."""
    project, _ = require_project_access(db, user.id, project_id)

    dd_check = (
        db.query(DDCheck)
        .filter(DDCheck.project_id == project_id)
        .order_by(DDCheck.created_at.desc())
        .first()
    )
    if not dd_check:
        raise HTTPException(
            status_code=404, detail="No analysis found for this project"
        )

    return DDReportResponse(
        check_id=str(dd_check.id),
        project_id=str(dd_check.project_id),
        status=dd_check.status,
        report=dd_check.report,
        error_message=dd_check.error_message,
        started_at=dd_check.started_at.isoformat() if dd_check.started_at else None,
        completed_at=dd_check.completed_at.isoformat()
        if dd_check.completed_at
        else None,
    )


@router.get("/{project_id}/results/{check_id}", response_model=DDReportResponse)
def get_check_result(
    project_id: UUID,
    check_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Get a specific DD check result."""
    project, _ = require_project_access(db, user.id, project_id)

    dd_check = (
        db.query(DDCheck)
        .filter(DDCheck.id == check_id, DDCheck.project_id == project_id)
        .first()
    )
    if not dd_check:
        raise HTTPException(status_code=404, detail="Analysis check not found")

    return DDReportResponse(
        check_id=str(dd_check.id),
        project_id=str(dd_check.project_id),
        status=dd_check.status,
        report=dd_check.report,
        error_message=dd_check.error_message,
        started_at=dd_check.started_at.isoformat() if dd_check.started_at else None,
        completed_at=dd_check.completed_at.isoformat()
        if dd_check.completed_at
        else None,
    )


@router.get(
    "/{project_id}/results/{check_id}/hitl-review-data",
    response_model=dict,
)
def get_hitl_review_data(
    project_id: UUID,
    check_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Get HITL review payload (tenant_records, signing_sources, signing_percentage) for the review UI."""
    project, _ = require_project_access(db, user.id, project_id)

    dd_check = (
        db.query(DDCheck)
        .filter(DDCheck.id == check_id, DDCheck.project_id == project_id)
        .first()
    )
    if not dd_check:
        raise HTTPException(status_code=404, detail="Analysis check not found")
    if dd_check.status != "needs_review" or not dd_check.hitl_data:
        raise HTTPException(
            status_code=400,
            detail="This check is not awaiting tenant table review or has no HITL data.",
        )

    return dd_check.hitl_data


@router.post(
    "/{project_id}/results/{check_id}/approve-tenant-table",
    response_model=AnalyzeResponse,
)
async def approve_tenant_table(
    project_id: UUID,
    check_id: UUID,
    body: TenantTableApproval = Body(...),
    user: CurrentUser = Depends(get_approved_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Approve (or edit) tenant table and run Phase 2 synthesis to complete the report."""
    await require_project_owner_async(db, user.id, project_id)

    result = await db.execute(
        select(DDCheck).where(DDCheck.id == check_id, DDCheck.project_id == project_id)
    )
    dd_check = result.scalar_one_or_none()
    if not dd_check:
        raise HTTPException(status_code=404, detail="Analysis check not found")
    if dd_check.status != "needs_review":
        raise HTTPException(
            status_code=400,
            detail="This check is not awaiting tenant table review.",
        )
    session_id = dd_check.agent_session_id
    if not session_id:
        raise HTTPException(
            status_code=400,
            detail="No session to continue; cannot run Phase 2.",
        )

    _ensure_genai_env()

    if body.correction_prompt:
        try:
            updated_hitl_data = await _rerun_main_synthesis_with_correction(
                session_id=session_id,
                correction_prompt=body.correction_prompt,
            )
        except Exception as exc:
            logger.exception("Main synthesis re-run failed: %s", exc)
            raise HTTPException(status_code=500, detail=str(exc))

        result = await db.execute(select(DDCheck).where(DDCheck.id == check_id))
        dd_check = result.scalar_one()
        dd_check.hitl_data = updated_hitl_data

        await db.commit()
        await db.refresh(dd_check)

        logger.info(
            "Main synthesis re-run with correction complete, still needs_review: check_id=%s",
            check_id,
        )

        return AnalyzeResponse(
            check_id=str(dd_check.id),
            status="needs_review",
            report=None,
        )

    result = await db.execute(select(Project).where(Project.id == project_id))
    project_row = result.scalar_one()
    project_title = project_row.title
    dd_check.status = "processing"
    project_row.status = "processing"
    project_row.pipeline_stage = "synthesis"
    await db.commit()

    task = asyncio.create_task(
        _run_phase2_task(
            check_id=check_id,
            project_id=project_id,
            session_id=session_id,
            approved_records=body.tenant_records,
            user_email=user.email,
            project_title=project_title,
        )
    )
    _running_analysis_tasks.add(task)
    task.add_done_callback(_running_analysis_tasks.discard)

    return AnalyzeResponse(
        check_id=str(dd_check.id),
        status="processing",
        report=None,
    )


def _norm_doc_name(s: str) -> str:
    """Normalize document name for matching (align with frontend and citation_locator)."""
    if not s:
        return ""
    s = PurePosixPath(s).stem.lower().strip()
    s = re.sub(r"\s+", " ", s).strip().replace(" ", "")
    s = re.sub(r"[\u2022\u00b7\u30fb]", "", s)
    return s


def _find_file_by_document_name(
    project_id: UUID, document_name: str, db: Session
) -> File | None:
    """Return the project File whose original_name matches document_name, or None."""
    files = db.query(File).filter(File.project_id == project_id).all()
    target = _norm_doc_name(document_name)
    if not target:
        return None
    for f in files:
        if _norm_doc_name(f.original_name) == target:
            return f
    for f in files:
        if _norm_doc_name(f.original_name).startswith(target):
            return f
    for f in files:
        fn = _norm_doc_name(f.original_name)
        if target in fn or fn in target:
            return f
    return None


@router.get(
    "/{project_id}/results/{check_id}/citation",
    response_model=CitationViewResponse,
)
def get_citation_view(
    project_id: UUID,
    check_id: UUID,
    finding_index: int = Query(
        default=-1,
        ge=-1,
        description="Index into report.findings; use -1 when citation_section is set",
    ),
    source_index: int = Query(
        ge=0, description="Index into finding.sources or section sources"
    ),
    citation_section: str | None = Query(
        default=None,
        description="Section key for non-finding citations: tenant_signing | tenant_warning_note",
    ),
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Serve signed URL + precomputed polygons for a citation (from stored report).

    Either (finding_index, source_index) for report.findings, or (citation_section, source_index)
    for report.tenant_table_signing_sources / report.tenant_table_warning_note_sources.
    No DocAI or GCS read at view time; polygons are taken from the annotation spec
    stored when the report was generated.
    """
    project, _ = require_project_access(db, user.id, project_id)

    dd_check = (
        db.query(DDCheck)
        .filter(DDCheck.id == check_id, DDCheck.project_id == project_id)
        .first()
    )
    if not dd_check or not dd_check.report:
        raise HTTPException(status_code=404, detail="Analysis report not found")

    report = dd_check.report

    if citation_section:
        section_map = {
            "tenant_signing": "tenant_table_signing_sources",
            "tenant_warning_note": "tenant_table_warning_note_sources",
        }
        section_key = section_map.get(citation_section)
        if not section_key:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid citation_section: {citation_section!r}",
            )
        sources = report.get(section_key) or []
    else:
        findings = report.get("findings") or []
        if finding_index >= len(findings):
            raise HTTPException(status_code=404, detail="Finding index out of range")
        sources = findings[finding_index].get("sources") or []

    if source_index >= len(sources):
        raise HTTPException(status_code=404, detail="Source index out of range")

    source = sources[source_index]
    document_name = source.get("source_document_name") or ""
    page_number = int(source.get("page_number") or 1)
    bounding_boxes = source.get("bounding_boxes") or []

    file = _find_file_by_document_name(project_id, document_name, db)
    if not file:
        raise HTTPException(
            status_code=404,
            detail=f"File not found for document: {document_name!r}",
        )
    if file.upload_status != "uploaded":
        raise HTTPException(status_code=409, detail="File is not uploaded yet")

    try:
        from app.services.gcs import generate_signed_view_url

        url, exp = generate_signed_view_url(
            gcs_uri=file.gcs_uri,
            filename=file.original_name,
            content_type=file.content_type or "application/pdf",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Failed to generate view URL: {exc}"
        )

    return CitationViewResponse(
        view_url=url,
        expires_in_seconds=exp,
        page_number=page_number,
        bounding_boxes=bounding_boxes,
        document_name=document_name,
    )


@router.get("/{project_id}/results/{check_id}/export/pdf")
def export_check_pdf(
    project_id: UUID,
    check_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Export a completed DD check report as a PDF file."""
    from urllib.parse import quote

    from fastapi.responses import Response as FastAPIResponse

    from app.agents.schemas import DDReport, RealEstateFinanceDDReport
    from app.services.pdf_export import generate_pdf_report

    project, _ = require_project_access(db, user.id, project_id)

    dd_check = (
        db.query(DDCheck)
        .filter(DDCheck.id == check_id, DDCheck.project_id == project_id)
        .first()
    )
    if not dd_check or not dd_check.report:
        raise HTTPException(status_code=404, detail="Analysis report not found")

    report_dict = dd_check.report
    if "tenant_table" in report_dict:
        report = RealEstateFinanceDDReport.model_validate(report_dict)
    else:
        report = DDReport.model_validate(report_dict)

    project_title = project.title or "report"
    pdf_bytes = generate_pdf_report(report, project_title)

    safe_title = (
        "".join(c for c in project_title if c.isalnum() or c in " -_")
        .strip()[:80]
        or "report"
    )
    date_str = dd_check.completed_at.strftime("%Y-%m-%d") if dd_check.completed_at else "export"
    filename = f"{safe_title}_דוח_נאותות_{date_str}.pdf"
    encoded_filename = quote(filename, safe="")

    return FastAPIResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"},
    )


@router.get("/{project_id}/results/{check_id}/export/word")
def export_check_word(
    project_id: UUID,
    check_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Export a completed DD check report as a Word (.docx) file."""
    from urllib.parse import quote

    from fastapi.responses import Response as FastAPIResponse

    from app.agents.schemas import DDReport, RealEstateFinanceDDReport
    from app.services.word_export import generate_word_report

    project, _ = require_project_access(db, user.id, project_id)

    dd_check = (
        db.query(DDCheck)
        .filter(DDCheck.id == check_id, DDCheck.project_id == project_id)
        .first()
    )
    if not dd_check or not dd_check.report:
        raise HTTPException(status_code=404, detail="Analysis report not found")

    report_dict = dd_check.report
    if "tenant_table" in report_dict:
        report = RealEstateFinanceDDReport.model_validate(report_dict)
    else:
        report = DDReport.model_validate(report_dict)

    project_title = project.title or "report"

    # Fetch org language for export
    from app.core.authorization import DEFAULT_ORGANIZATION_ID
    org_id = user.organization_id or DEFAULT_ORGANIZATION_ID
    org_for_lang = db.query(Organization).filter(Organization.id == org_id).first()
    export_language = (org_for_lang.language if org_for_lang else None) or "he"

    # Attach in-app comments as Word margin annotations
    comments_by_section: dict[str, list[dict]] = {}
    try:
        from app.db.models import ReportComment
        raw_comments = (
            db.query(ReportComment)
            .filter(ReportComment.project_id == project_id)
            .order_by(ReportComment.created_at.asc())
            .all()
        )
        for c in raw_comments:
            key = c.section_key
            if key not in comments_by_section:
                comments_by_section[key] = []
            comments_by_section[key].append({
                "content": c.content,
                "author_name": c.author_name,
                "author_email": c.author_email,
                "created_at": c.created_at,
            })
    except Exception as exc:
        logger.warning("Word export: could not load comments (table may not exist yet): %s", exc)

    try:
        docx_bytes = generate_word_report(report, project_title, comments_by_section or None, language=export_language)
    except Exception as exc:
        logger.error("Word export: generate_word_report failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"שגיאה בייצוא הדוח: {exc}") from exc

    safe_title = (
        "".join(c for c in project_title if c.isalnum() or c in " -_")
        .strip()[:80]
        or "report"
    )
    date_str = dd_check.completed_at.strftime("%Y-%m-%d") if dd_check.completed_at else "export"
    filename = f"{safe_title}_דוח_נאותות_{date_str}.docx"
    encoded_filename = quote(filename, safe="")

    return FastAPIResponse(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"},
    )


@router.get(
    "/{project_id}/results/{check_id}/session",
    response_model=AgentSessionEventsResponse,
)
async def get_check_sessions(
    project_id: UUID,
    check_id: UUID,
    num_recent_events: int | None = Query(
        default=200,
        ge=1,
        le=2000,
        description="Number of most recent events to return per session",
    ),
    user: CurrentUser = Depends(get_approved_user),
    db: AsyncSession = Depends(get_async_db),
):
    """Get persisted ADK session event history for a DD check."""
    await require_project_access_async(db, user.id, project_id)

    result = await db.execute(
        select(DDCheck).where(DDCheck.id == check_id, DDCheck.project_id == project_id)
    )
    dd_check = result.scalar_one_or_none()
    if not dd_check:
        raise HTTPException(status_code=404, detail="Analysis check not found")

    from app.agents.session_store import get_session_events

    dd_app_name = "d-done"
    judge_app_name = "d-done-qa"
    dd_user_id = "dd-system"
    judge_user_id = "qa-judge"

    agent_events: list[dict] = []
    judge_events: list[dict] = []

    if dd_check.agent_session_id:
        agent_events = await get_session_events(
            app_name=dd_app_name,
            user_id=dd_user_id,
            session_id=dd_check.agent_session_id,
            num_recent_events=num_recent_events,
        )

    if dd_check.judge_session_id:
        judge_events = await get_session_events(
            app_name=judge_app_name,
            user_id=judge_user_id,
            session_id=dd_check.judge_session_id,
            num_recent_events=num_recent_events,
        )

    return AgentSessionEventsResponse(
        agent_session_id=dd_check.agent_session_id,
        judge_session_id=dd_check.judge_session_id,
        agent_events=agent_events,
        judge_events=judge_events,
    )


# ---- Internal helpers ----


# MIME types that Vertex AI Gemini can process natively via Part.from_uri().
# According to the official docs, Gemini 3.x / 2.5 models support:
#   - application/pdf        (page-based, with box_2d visual grounding)
#   - text/plain             (raw text; also covers .csv/.txt sent as text/plain)
#   - image/*                (jpeg, png, gif, webp, heic, heif)
# Word (.docx) and Excel (.xlsx) are NOT natively supported — those files are
# downloaded from GCS and text-extracted, then injected as Part.from_text().
_GEMINI_SUPPORTED_MIME: frozenset[str] = frozenset({
    "application/pdf",
    "text/plain",
    "text/csv",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/heic",
    "image/heif",
})

_EXT_TO_GEMINI_MIME: dict[str, str] = {
    # PDF
    "pdf": "application/pdf",
    # Images
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "heic": "image/heic",
    "heif": "image/heif",
    # Plain text — Gemini reads these natively via GCS URI
    "txt": "text/plain",
    "csv": "text/csv",
}


def _gemini_mime(file) -> str | None:
    """Return the Gemini-compatible MIME type for a file, or None if unsupported.

    Returns a MIME type string when the file can be sent as a native GCS URI
    part.  Returns None for formats that require text extraction (Word, Excel,
    email, HTML, …) before being usable by the model.
    """
    ct = (file.content_type or "").lower().split(";")[0].strip()
    if ct in _GEMINI_SUPPORTED_MIME:
        return ct
    ext = file.original_name.rsplit(".", 1)[-1].lower() if "." in file.original_name else ""
    return _EXT_TO_GEMINI_MIME.get(ext)


def _ensure_genai_env() -> None:
    """Configure environment variables for the GenAI client."""
    import os

    use_vertex_env = os.environ.get(
        "GOOGLE_GENAI_USE_VERTEXAI", ""
    ).strip().lower() in {
        "1",
        "true",
        "yes",
        "y",
        "on",
    }

    if use_vertex_env or (not settings.gemini_api_key and settings.gcp_project_id):
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"

        if settings.gcp_project_id and not os.environ.get("GOOGLE_CLOUD_PROJECT"):
            os.environ["GOOGLE_CLOUD_PROJECT"] = settings.gcp_project_id
        if settings.vertex_ai_location and not os.environ.get("GOOGLE_CLOUD_LOCATION"):
            os.environ["GOOGLE_CLOUD_LOCATION"] = settings.vertex_ai_location
    else:
        gemini_key = (
            settings.gemini_api_key or os.environ.get("GEMINI_API_KEY", "")
        ).strip()
        if not gemini_key:
            raise RuntimeError(
                "GenAI is not configured. Either:\n"
                "- configure Vertex AI (set GCP_PROJECT_ID and VERTEX_AI_LOCATION, and ensure ADC), or\n"
                "- set GEMINI_API_KEY (fallback)."
            )
        os.environ["GEMINI_API_KEY"] = gemini_key


def _postprocess_report_dict(report_dict: dict) -> dict:
    """Deterministic fixes applied to every report dict before saving.

    Runs in Python — no AI involved — so it is reliable across all projects.
    """
    zrm = report_dict.get("zero_report_metrics")
    if not isinstance(zrm, dict):
        return report_dict

    pot = zrm.get("profit_on_turnover")
    poc = zrm.get("profit_on_cost")

    # If either profit field is missing, try to calculate from raw revenue/cost.
    # These may have been extracted by the zero-report extractor even when the
    # synthesis agent failed to carry the calculation through.
    if pot is None or poc is None:
        revenue = zrm.get("_revenue") or report_dict.get("_zero_report_revenue")
        cost = zrm.get("_cost") or report_dict.get("_zero_report_cost")

        # Also try top-level extraction fields that the zero-report agent stores
        # before the synthesis stage merges them.
        if revenue is None or cost is None:
            zre = report_dict.get("zero_report_extraction") or {}
            if isinstance(zre, dict):
                revenue = revenue or zre.get("total_projected_revenue_ils")
                cost = cost or zre.get("total_project_cost_ils")

        if revenue and cost and revenue > 0 and cost > 0:
            profit = revenue - cost
            if pot is None:
                zrm["profit_on_turnover"] = round(profit / revenue, 4)
            if poc is None:
                zrm["profit_on_cost"] = round(profit / cost, 4)

    report_dict["zero_report_metrics"] = zrm

    # construction_restrictions must always be a non-empty list.
    cr = zrm.get("construction_restrictions")
    if not cr:
        zrm["construction_restrictions"] = [
            'לא אותרה התייחסות להגבלות בנייה בדו"ח האפס ובועדת האשראי'
        ]

    # Mezzanine must always surface — at minimum a "not found" note.
    financing = report_dict.get("financing")
    if isinstance(financing, dict):
        mez_exists = financing.get("mezzanine_loan_exists")
        mez_details = financing.get("mezzanine_loan_details")
        if mez_exists is None and not mez_details:
            financing["mezzanine_loan_details"] = (
                "לא אותרה התייחסות למימון מזנין במסמכים שנבדקו"
            )

    return report_dict


def _apply_hitl_tenant_overrides(report_dict: dict, approved_records: list[dict]) -> None:
    """Mandatory post-LLM enforcement of user-approved is_signed values.

    The user's HITL decisions are the sole source of truth. This runs after
    Phase 2 LLM completes and unconditionally overwrites every tenant_table row
    that matches an approved record. Rows with no HITL match are left as-is
    (the LLM-derived value acts as a fallback for genuinely new sub-parcels).

    HITL records come from agreement_extraction.tenant_records which have
    sub_parcel + owner_name but NO helka (helka is Tabu-only). Phase 2 builds
    tenant_table from Tabu and assigns helka. Matching is by sub_parcel alone
    unless approved records explicitly carry helka/parcel.
    """
    if not approved_records:
        return
    tenant_table: list[dict] = report_dict.get("tenant_table") or []
    if not tenant_table:
        return

    # Decide matching strategy: use (helka, sub_parcel) only when approved records
    # actually carry helka/parcel info; otherwise fall back to sub_parcel alone.
    has_helka = any(
        bool(rec.get("helka") or rec.get("parcel"))
        for rec in approved_records
    )

    approved_map: dict[tuple, bool] = {}
    for rec in approved_records:
        sub = str(rec.get("sub_parcel") or "").strip()
        is_signed = rec.get("is_signed")
        if is_signed is None or not sub:
            continue
        if has_helka:
            helka = str(rec.get("helka") or rec.get("parcel") or "").strip()
            approved_map[(helka, sub)] = bool(is_signed)
        else:
            approved_map[(sub,)] = bool(is_signed)

    patched = 0
    for row in tenant_table:
        sub = str(row.get("sub_parcel") or "").strip()
        if has_helka:
            helka = str(row.get("helka") or "").strip()
            key: tuple = (helka, sub)
        else:
            key = (sub,)
        if key in approved_map:
            row["is_signed"] = approved_map[key]
            patched += 1

    # Fallback: if matching failed for some/all rows, apply by position.
    # This handles cases where sub_parcel values differ between HITL source
    # and Phase 2 output (e.g. agreement vs Tabu numbering mismatch).
    if patched < len(tenant_table) and len(approved_records) == len(tenant_table):
        positional_values = [
            rec.get("is_signed")
            for rec in approved_records
            if rec.get("is_signed") is not None
        ]
        if len(positional_values) == len(tenant_table):
            for i, row in enumerate(tenant_table):
                sub = str(row.get("sub_parcel") or "").strip()
                key = (sub,) if not has_helka else (str(row.get("helka") or "").strip(), sub)
                if key not in approved_map:
                    row["is_signed"] = positional_values[i]
                    patched += 1
            logger.info("HITL override: positional fallback applied for %d rows", patched)

    # Always recalculate signing_percentage after override.
    signed = sum(1 for r in tenant_table if r.get("is_signed") is True)
    total = len(tenant_table)
    report_dict["signing_percentage"] = round(signed / total, 4) if total else 0.0

    if patched:
        logger.info(
            "HITL override: patched %d/%d tenant rows (helka_match=%s); signing_percentage=%.2f",
            patched, total, has_helka, report_dict["signing_percentage"],
        )
    else:
        logger.warning(
            "HITL override: 0 rows patched (approved=%d, table=%d, helka_match=%s) — key mismatch?",
            len(approved_records), len(tenant_table), has_helka,
        )


class _AnalysisResult:
    """Internal container for the DD report or HITL intermediate state."""

    def __init__(
        self,
        report_dict: dict,
        agent_session_id: str | None = None,
        needs_review: bool = False,
        hitl_data: dict | None = None,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        total_tokens: int = 0,
    ):
        self.report_dict = report_dict
        self.agent_session_id = agent_session_id
        self.needs_review = needs_review
        self.hitl_data = hitl_data
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens
        self.total_tokens = total_tokens


async def _run_analysis(
    *,
    project_id: UUID,
    uploaded_files: list[File],
    on_stage_change: Callable[[str], Awaitable[None]] | None = None,
    use_visual_grounding: bool = False,
    phase1_only: bool = False,
    transaction_metadata: dict | None = None,
    language: str = "he",
) -> _AnalysisResult:
    """Run the DD analysis via the ADK root agent.

    Pre-seeds session state with file metadata, then sends a message
    describing the transaction. The root agent routes to the right pipeline.

    When use_visual_grounding and phase1_only are True, runs only Phase 1
    (classifier + extractors + main synthesis) and returns needs_review with
    hitl_data for tenant table review.
    """
    from google.adk.artifacts import InMemoryArtifactService
    from google.adk.memory import InMemoryMemoryService
    from google.adk.runners import Runner
    from google.genai import types

    from app.agents.constants import (
        APP_NAME,
        STATE_CONTENT_TYPES,
        STATE_DOCUMENT_NAMES,
        STATE_ENRICHED_REPORT,
        STATE_GCS_URIS,
        STATE_LANGUAGE,
        STATE_PROJECT_ID,
        STATE_REPRESENTING_ROLE,
        STATE_TEXT_PARTS,
        SYSTEM_USER_ID,
    )
    from app.agents.visual_grounding_pipeline_agent import (
        create_vg_app,
        create_visual_grounding_pipeline,
        create_visual_grounding_pipeline_phase1,
        STATE_HITL_TENANT_DATA,
    )
    from app.agents.session_store import get_session_service
    from app.services.text_extractor import extract_text_parts
    _ensure_genai_env()

    if on_stage_change:
        await on_stage_change(PIPELINE_STAGE_EXTRACTION)

    # Gemini natively processes PDFs and images via GCS URI.
    # Excel, Word, CSV, HTML and email files are text-extracted and injected
    # as Part.from_text() so the model still sees their content.
    gemini_files = [(f, _gemini_mime(f)) for f in uploaded_files]
    gemini_files = [(f, m) for f, m in gemini_files if m is not None]

    non_gemini = [f for f in uploaded_files if _gemini_mime(f) is None]
    if non_gemini:
        logger.info(
            "Extracting text from %d non-PDF/image file(s): %s",
            len(non_gemini),
            [f.original_name for f in non_gemini],
        )
    text_parts_list = await extract_text_parts(non_gemini)
    text_parts: dict[str, str] = {tp.filename: tp.text for tp in text_parts_list}
    if text_parts:
        logger.info("Text extracted from %d file(s): %s", len(text_parts), list(text_parts.keys()))

    gcs_uris = [f.gcs_uri for f, _ in gemini_files]
    doc_names = [f.original_name for f, _ in gemini_files]
    content_types = [m for _, m in gemini_files]

    representing_role = (transaction_metadata or {}).get("representing_role")
    initial_state = {
        STATE_PROJECT_ID: str(project_id),
        STATE_GCS_URIS: gcs_uris,
        STATE_DOCUMENT_NAMES: doc_names,
        STATE_CONTENT_TYPES: content_types,
        STATE_TEXT_PARTS: text_parts,
        STATE_REPRESENTING_ROLE: representing_role,
        STATE_LANGUAGE: language,
    }

    session_service = get_session_service()
    session_id = str(uuid4())
    await session_service.create_session(
        app_name=APP_NAME,
        user_id=SYSTEM_USER_ID,
        session_id=session_id,
        state=initial_state,
    )

    # Direct pipeline invocation — no orchestrator LLM. Transaction type from project/request.
    pipeline = (
        create_visual_grounding_pipeline_phase1()
        if phase1_only
        else create_visual_grounding_pipeline()
    )
    app = create_vg_app(pipeline, name=APP_NAME)
    runner = Runner(
        app=app,
        app_name=APP_NAME,  # override for session lookup (App uses d_done)
        session_service=session_service,
        artifact_service=InMemoryArtifactService(),
        memory_service=InMemoryMemoryService(),
        auto_create_session=False,
    )

    manifest_lines = [f"{i + 1}. {name}" for i, name in enumerate(doc_names)]
    user_message = types.Content(
        role="user",
        parts=[
            types.Part.from_text(
                text=(
                    "Run due-diligence check.\n\n"
                    "Transaction type: real_estate_finance\n\n"
                    f"Documents ({len(doc_names)}):\n" + "\n".join(manifest_lines)
                )
            )
        ],
    )

    logger.info(
        "Starting DD pipeline for project %s (%d files)%s",
        project_id,
        len(uploaded_files),
        " (phase1 only)" if phase1_only else "",
    )

    _prompt_tokens = 0
    _completion_tokens = 0
    try:
        async for event in runner.run_async(
            user_id=SYSTEM_USER_ID,
            session_id=session_id,
            new_message=user_message,
        ):
            if event.usage_metadata:
                _prompt_tokens += event.usage_metadata.prompt_token_count or 0
                _completion_tokens += event.usage_metadata.candidates_token_count or 0
    except BaseExceptionGroup as beg:
        real = [e for e in beg.exceptions if not isinstance(e, GeneratorExit)]
        if real:
            raise

    session = await session_service.get_session(
        app_name=APP_NAME,
        user_id=SYSTEM_USER_ID,
        session_id=session_id,
    )
    state = session.state or {}

    if phase1_only and use_visual_grounding:
        main_output = state.get("synthesis_main_output") or {}
        agreement_extraction = state.get("agreement_extraction") or {}

        # Use Phase 1 tenant_table (built from Tabu) as the HITL source.
        # Phase 1 uses the definitive Tabu sub_parcel numbers, which are identical
        # to what Phase 2 will produce — guaranteeing perfect sub_parcel matching
        # when the user's decisions are applied after Phase 2.
        # Fall back to agreement_extraction.tenant_records only if Phase 1 produced
        # no tenant_table (shouldn't happen in practice).
        phase1_tenant_table: list[dict] = main_output.get("tenant_table") or []
        if phase1_tenant_table:
            # Build a lookup from agreement records for source-document attribution
            # (for HITL UI tab grouping). Match by sub_parcel first, then owner_name.
            agreement_records: list[dict] = agreement_extraction.get("tenant_records") or []
            agr_by_sub: dict[str, dict] = {
                str(r.get("sub_parcel") or "").strip(): r
                for r in agreement_records
                if r.get("sub_parcel") is not None
            }
            agr_by_owner: dict[str, dict] = {}
            for r in agreement_records:
                key = " ".join((r.get("owner_name") or "").split()).lower()
                if key:
                    agr_by_owner[key] = r

            tenant_records = []
            for row in phase1_tenant_table:
                sub = str(row.get("sub_parcel") or "").strip()
                owner_key = " ".join((row.get("owner_name") or "").split()).lower()
                agr = agr_by_sub.get(sub) or agr_by_owner.get(owner_key)
                tenant_records.append({
                    "sub_parcel": row.get("sub_parcel"),
                    "owner_name": row.get("owner_name"),
                    "is_signed": row.get("is_signed"),
                    "date_signed": row.get("date_signed"),
                    "source": agr.get("source") if agr else None,
                })
        else:
            tenant_records = (
                state.get(STATE_HITL_TENANT_DATA)
                or agreement_extraction.get("tenant_records")
                or []
            )

        signing_percentage = main_output.get("signing_percentage") or 0.0
        signing_sources = main_output.get("tenant_table_signing_sources") or []
        hitl_data = {
            "tenant_records": tenant_records,
            "signing_percentage": signing_percentage,
            "signing_sources": signing_sources,
            "block": agreement_extraction.get("block"),
            "parcel": agreement_extraction.get("parcel"),
        }
        return _AnalysisResult(
            report_dict={},
            agent_session_id=session_id,
            needs_review=True,
            hitl_data=hitl_data,
            prompt_tokens=_prompt_tokens,
            completion_tokens=_completion_tokens,
            total_tokens=_prompt_tokens + _completion_tokens,
        )

    report_dict = state.get(STATE_ENRICHED_REPORT) or state.get("finance_dd_report")
    if not report_dict:
        raise RuntimeError("Pipeline produced no report in session state")

    report_dict["agent_session_id"] = session_id
    report_dict = _postprocess_report_dict(report_dict)

    return _AnalysisResult(
        report_dict=report_dict,
        agent_session_id=session_id,
        prompt_tokens=_prompt_tokens,
        completion_tokens=_completion_tokens,
        total_tokens=_prompt_tokens + _completion_tokens,
    )


async def _run_analysis_phase2(
    session_id: str,
    approved_tenant_records: list[dict],
) -> _AnalysisResult:
    """Run Phase 2 only: details synthesis agent using existing session state.

    Caller must set _phase2_approved_records contextvar before calling so the
    details agent's state injector can read it.
    """
    from google.adk.artifacts import InMemoryArtifactService
    from google.adk.memory import InMemoryMemoryService
    from google.adk.runners import Runner
    from google.genai import types

    from app.agents.constants import (
        APP_NAME,
        STATE_ENRICHED_REPORT,
        SYSTEM_USER_ID,
    )
    from app.agents.session_store import get_session_service
    from app.agents.visual_grounding_pipeline_agent import create_vg_app
    from app.agents.visual_grounding_synthesis import create_vg_synthesis_agents

    session_service = get_session_service()

    _, details_agent = create_vg_synthesis_agents()

    def _inject_approved_records(callback_context, llm_request):
        callback_context.state["_approved_tenant_records"] = approved_tenant_records
        if approved_tenant_records:
            import json as _json
            from google.genai import types as _types
            compact = [
                {"sub_parcel": str(r.get("sub_parcel") or ""), "is_signed": r.get("is_signed")}
                for r in approved_tenant_records
                if r.get("sub_parcel") is not None and r.get("is_signed") is not None
            ]
            if compact:
                notice = (
                    "## HITL_APPROVED_TENANT_DECISIONS\n"
                    "The user has manually reviewed and confirmed the following is_signed values.\n"
                    "These are AUTHORITATIVE — use them directly for `is_signed` in every tenant_table row.\n"
                    "Match by `sub_parcel`. Do NOT re-derive from documents.\n\n"
                    f"{_json.dumps(compact, ensure_ascii=False)}"
                )
                llm_request.contents.insert(
                    0,
                    _types.Content(
                        role="user",
                        parts=[_types.Part.from_text(text=notice)],
                    ),
                )

    details_agent.before_model_callback = _inject_approved_records

    app = create_vg_app(details_agent, name=APP_NAME)
    runner = Runner(
        app=app,
        app_name=APP_NAME,  # override for session lookup (App uses d_done)
        session_service=session_service,
        artifact_service=InMemoryArtifactService(),
        memory_service=InMemoryMemoryService(),
        auto_create_session=False,
    )

    user_message = types.Content(
        role="user",
        parts=[types.Part.from_text(text="Continue with approved tenant table. Produce tenant_table and findings.")],
    )

    logger.info("Starting DD Phase 2 for session_id=%s", session_id)

    _prompt_tokens = 0
    _completion_tokens = 0
    try:
        async for event in runner.run_async(
            user_id=SYSTEM_USER_ID,
            session_id=session_id,
            new_message=user_message,
        ):
            if event.usage_metadata:
                _prompt_tokens += event.usage_metadata.prompt_token_count or 0
                _completion_tokens += event.usage_metadata.candidates_token_count or 0
    except BaseExceptionGroup as beg:
        real = [e for e in beg.exceptions if not isinstance(e, GeneratorExit)]
        if real:
            raise

    session = await session_service.get_session(
        app_name=APP_NAME,
        user_id=SYSTEM_USER_ID,
        session_id=session_id,
    )
    state = session.state or {}

    report_dict = state.get(STATE_ENRICHED_REPORT) or state.get("finance_dd_report")
    if not report_dict:
        raise RuntimeError("Phase 2 produced no report in session state")

    report_dict["agent_session_id"] = session_id
    report_dict = _postprocess_report_dict(report_dict)

    return _AnalysisResult(
        report_dict=report_dict,
        agent_session_id=session_id,
        prompt_tokens=_prompt_tokens,
        completion_tokens=_completion_tokens,
        total_tokens=_prompt_tokens + _completion_tokens,
    )


async def _rerun_main_synthesis_with_correction(
    session_id: str,
    correction_prompt: str,
) -> dict:
    """Re-run main synthesis agent with user correction, return updated hitl_data."""
    from google.adk.artifacts import InMemoryArtifactService
    from google.adk.memory import InMemoryMemoryService
    from google.adk.runners import Runner
    from google.genai import types

    from app.agents.constants import APP_NAME, SYSTEM_USER_ID
    from app.agents.session_store import get_session_service
    from app.agents.visual_grounding_pipeline_agent import (
        STATE_HITL_TENANT_DATA,
        create_vg_app,
    )
    from app.agents.visual_grounding_synthesis import create_vg_synthesis_agents

    session_service = get_session_service()

    main_agent, _ = create_vg_synthesis_agents()

    async def _store_correction_result(callback_context) -> None:
        agreement_extraction: dict = callback_context.state.get("agreement_extraction") or {}
        tenant_records = agreement_extraction.get("tenant_records") or []
        callback_context.state[STATE_HITL_TENANT_DATA] = tenant_records

    main_agent.after_agent_callback = _store_correction_result

    def _inject_correction(callback_context, llm_request):
        callback_context.state["_user_correction_prompt"] = correction_prompt

    main_agent.before_model_callback = _inject_correction

    app = create_vg_app(main_agent, name=APP_NAME)
    runner = Runner(
        app=app,
        app_name=APP_NAME,  # override for session lookup (App uses d_done)
        session_service=session_service,
        artifact_service=InMemoryArtifactService(),
        memory_service=InMemoryMemoryService(),
        auto_create_session=False,
    )

    user_message = types.Content(
        role="user",
        parts=[types.Part.from_text(
            text=(
                f"The user reviewed the tenant table and found issues. "
                f"Please re-analyze based on this correction:\n\n{correction_prompt}\n\n"
                f"Produce corrected synthesis_main_output with updated tenant_records."
            )
        )],
    )

    logger.info("Re-running main synthesis with correction for session_id=%s", session_id)

    try:
        async for event in runner.run_async(
            user_id=SYSTEM_USER_ID,
            session_id=session_id,
            new_message=user_message,
        ):
            pass
    except BaseExceptionGroup as beg:
        real = [e for e in beg.exceptions if not isinstance(e, GeneratorExit)]
        if real:
            raise

    session = await session_service.get_session(
        app_name=APP_NAME,
        user_id=SYSTEM_USER_ID,
        session_id=session_id,
    )
    state = session.state or {}

    main_output = state.get("synthesis_main_output") or {}
    agreement_extraction = state.get("agreement_extraction") or {}
    tenant_records = state.get(STATE_HITL_TENANT_DATA) or agreement_extraction.get("tenant_records") or []
    signing_percentage = main_output.get("signing_percentage") or 0.0
    signing_sources = main_output.get("tenant_table_signing_sources") or []

    return {
        "tenant_records": tenant_records,
        "signing_percentage": signing_percentage,
        "signing_sources": signing_sources,
        "block": agreement_extraction.get("block"),
        "parcel": agreement_extraction.get("parcel"),
    }


# ---------------------------------------------------------------------------
# M&A pipeline runner (v1 — non-RAG, no HITL, no QA loop).
# ---------------------------------------------------------------------------


async def _run_ma_analysis(
    *,
    project_id: UUID,
    uploaded_files: list[File],
    transaction_metadata: dict,
    on_stage_change: Callable[[str], Awaitable[None]] | None = None,
    optional_chapters: list[str] | None = None,
) -> _AnalysisResult:
    """Run the M&A v1 DD pipeline to completion and return the report.

    Mirrors ``_run_analysis`` but uses ``create_ma_pipeline`` and skips the
    phase-1/HITL dance — the M&A v1 pipeline is synchronous and does not
    pause for user review.
    """
    from google.adk.artifacts import InMemoryArtifactService
    from google.adk.memory import InMemoryMemoryService
    from google.adk.runners import Runner
    from google.genai import types

    from app.agents.constants import (
        APP_NAME,
        STATE_CONTENT_TYPES,
        STATE_DOCUMENT_NAMES,
        STATE_ENRICHED_REPORT,
        STATE_FILE_SIZES,
        STATE_GCS_URIS,
        STATE_PROJECT_ID,
        STATE_TEXT_PARTS,
        SYSTEM_USER_ID,
    )
    from app.agents.ma.constants import STATE_MA_METADATA
    from app.agents.ma.pipeline import create_ma_pipeline
    from app.agents.session_store import get_session_service
    from app.agents.visual_grounding_pipeline_agent import create_vg_app
    from app.services.text_extractor import (
        extract_oversized_pdf_text_parts,
        extract_text_parts,
    )

    _ensure_genai_env()

    if on_stage_change:
        await on_stage_change(PIPELINE_STAGE_EXTRACTION)

    # Gemini natively processes PDFs and images via GCS URI, but has a 50 MiB
    # per-file limit for inline GCS references. Files exceeding this limit are
    # text-extracted via pypdf and injected as Part.from_text instead.
    _GEMINI_MAX_FILE_BYTES = 50 * 1024 * 1024

    all_gemini = [(f, _gemini_mime(f)) for f in uploaded_files]
    all_gemini = [(f, m) for f, m in all_gemini if m is not None]

    gemini_files = [(f, m) for f, m in all_gemini if (f.file_size_bytes or 0) <= _GEMINI_MAX_FILE_BYTES]
    oversized_files = [f for f, _ in all_gemini if (f.file_size_bytes or 0) > _GEMINI_MAX_FILE_BYTES]

    non_gemini = [f for f in uploaded_files if _gemini_mime(f) is None]
    if non_gemini:
        logger.info(
            "MA: Extracting text from %d non-PDF/image file(s): %s",
            len(non_gemini),
            [f.original_name for f in non_gemini],
        )

    text_parts_list = await extract_text_parts(non_gemini)
    oversized_text_parts_list = await extract_oversized_pdf_text_parts(oversized_files)

    text_parts: dict[str, str] = {
        tp.filename: tp.text
        for tp in (*text_parts_list, *oversized_text_parts_list)
    }
    if text_parts:
        logger.info("MA: Text extracted from %d file(s): %s", len(text_parts), list(text_parts.keys()))

    gcs_uris = [f.gcs_uri for f, _ in gemini_files]
    doc_names = [f.original_name for f, _ in gemini_files]
    content_types = [m for _, m in gemini_files]
    file_sizes = [f.file_size_bytes or 0 for f, _ in gemini_files]

    from app.agents.ma.constants import STATE_MA_SELECTED_CHAPTERS, MA_OPTIONAL_CHAPTERS
    resolved_optional = list(optional_chapters) if optional_chapters is not None else list(MA_OPTIONAL_CHAPTERS)

    initial_state = {
        STATE_PROJECT_ID: str(project_id),
        STATE_GCS_URIS: gcs_uris,
        STATE_DOCUMENT_NAMES: doc_names,
        STATE_CONTENT_TYPES: content_types,
        STATE_FILE_SIZES: file_sizes,
        STATE_TEXT_PARTS: text_parts,
        STATE_MA_METADATA: transaction_metadata or {},
        STATE_MA_SELECTED_CHAPTERS: resolved_optional,
    }

    session_service = get_session_service()
    session_id = str(uuid4())
    await session_service.create_session(
        app_name=APP_NAME,
        user_id=SYSTEM_USER_ID,
        session_id=session_id,
        state=initial_state,
    )

    pipeline = create_ma_pipeline(optional_chapters=optional_chapters)
    # Reuse the VG App wrapper so Gemini context caching kicks in for the
    # chapter agents' prompt payloads.
    app = create_vg_app(pipeline, name=APP_NAME)
    runner = Runner(
        app=app,
        app_name=APP_NAME,
        session_service=session_service,
        artifact_service=InMemoryArtifactService(),
        memory_service=InMemoryMemoryService(),
        auto_create_session=False,
    )

    manifest_lines = [f"{i + 1}. {name}" for i, name in enumerate(doc_names)]
    user_message = types.Content(
        role="user",
        parts=[
            types.Part.from_text(
                text=(
                    "Run M&A due-diligence check.\n\n"
                    "Transaction type: ma\n\n"
                    f"Documents ({len(doc_names)}):\n" + "\n".join(manifest_lines)
                )
            )
        ],
    )

    logger.info(
        "Starting MA DD pipeline for project %s (%d files)",
        project_id,
        len(uploaded_files),
    )

    _prompt_tokens = 0
    _completion_tokens = 0
    try:
        async for event in runner.run_async(
            user_id=SYSTEM_USER_ID,
            session_id=session_id,
            new_message=user_message,
        ):
            if event.usage_metadata:
                _prompt_tokens += event.usage_metadata.prompt_token_count or 0
                _completion_tokens += event.usage_metadata.candidates_token_count or 0
    except BaseExceptionGroup as beg:
        real = [e for e in beg.exceptions if not isinstance(e, GeneratorExit)]
        if real:
            raise

    session = await session_service.get_session(
        app_name=APP_NAME,
        user_id=SYSTEM_USER_ID,
        session_id=session_id,
    )
    state = session.state or {}

    report_dict = state.get(STATE_ENRICHED_REPORT) or state.get("ma_dd_report")
    if not report_dict:
        raise RuntimeError("M&A pipeline produced no report in session state")

    report_dict["agent_session_id"] = session_id

    return _AnalysisResult(
        report_dict=report_dict,
        agent_session_id=session_id,
        prompt_tokens=_prompt_tokens,
        completion_tokens=_completion_tokens,
        total_tokens=_prompt_tokens + _completion_tokens,
    )
