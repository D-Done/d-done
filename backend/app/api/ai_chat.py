"""AI Chat conversations — persistent history + optional project context.

Routes
------
POST   /ai/conversations                  — create a new conversation
GET    /ai/conversations                  — list user's conversations (newest first)
GET    /ai/conversations/{id}             — get conversation with messages
PATCH  /ai/conversations/{id}             — update title / project link
DELETE /ai/conversations/{id}             — delete conversation
POST   /ai/conversations/{id}/ask         — ask a question (saves to history)
GET    /ai/conversations/{id}/project-files — list project files linked to conversation
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.orm.attributes import flag_modified

from app.core.auth import CurrentUser, get_approved_user
from app.core.config import settings
from app.db.models import (
    AiConversation,
    DDCheck,
    File as FileModel,
    Project,
    ProjectMembership,
)
from app.db.session import AsyncSessionLocal

router = APIRouter(prefix="/ai", tags=["ai-chat"])
logger = logging.getLogger(__name__)

# Use the same flash model as bbox_lab (known to work on this Vertex AI project)
from app.api.bbox_lab import GEMINI_MODELS as _BBOX_MODELS
GEMINI_CHAT_MODEL = _BBOX_MODELS["flash"]    # "gemini-3-flash-preview"
GEMINI_FILES_MODEL = _BBOX_MODELS["flash"]   # same for GCS path


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Pydantic schemas ────────────────────────────────────────────────────────

class ConversationCreate(BaseModel):
    project_id: UUID | None = None
    title: str | None = None


class ConversationUpdate(BaseModel):
    project_id: UUID | None = None
    title: str | None = None
    clear_project: bool = False


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    citations: list | None = None
    tokens: int | None = None
    file_names: list[str] | None = None
    created_at: str


class ProjectFileOut(BaseModel):
    id: str
    filename: str
    gcs_uri: str


class ConversationOut(BaseModel):
    id: str
    title: str | None
    project_id: str | None
    project_title: str | None
    message_count: int
    created_at: str
    updated_at: str


class ConversationDetail(ConversationOut):
    messages: list[MessageOut]
    project_files: list[ProjectFileOut] | None = None


class AskResponse(BaseModel):
    answer: str
    citations: list
    model_used: str
    raw_token_usage: dict | None = None
    conversation_id: str


# ── Helpers ─────────────────────────────────────────────────────────────────

async def _assert_conv_owner(conv_id: UUID, user_id: UUID, db) -> AiConversation:
    result = await db.execute(
        select(AiConversation).where(
            and_(AiConversation.id == conv_id, AiConversation.user_id == user_id)
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


async def _project_title(project_id: UUID | None, db) -> str | None:
    if not project_id:
        return None
    result = await db.execute(select(Project).where(Project.id == project_id))
    p = result.scalar_one_or_none()
    return p.title if p else None


def _conv_out(conv: AiConversation, project_title: str | None) -> ConversationOut:
    return ConversationOut(
        id=str(conv.id),
        title=conv.title,
        project_id=str(conv.project_id) if conv.project_id else None,
        project_title=project_title,
        message_count=len(conv.messages or []),
        created_at=conv.created_at.isoformat(),
        updated_at=conv.updated_at.isoformat(),
    )


def _ensure_genai_env() -> None:
    use_vertex = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").strip().lower() in {
        "1", "true", "yes",
    }
    if use_vertex or (not settings.gemini_api_key and settings.gcp_project_id):
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"
        if settings.gcp_project_id and not os.environ.get("GOOGLE_CLOUD_PROJECT"):
            os.environ["GOOGLE_CLOUD_PROJECT"] = settings.gcp_project_id
        if settings.vertex_ai_location and not os.environ.get("GOOGLE_CLOUD_LOCATION"):
            os.environ["GOOGLE_CLOUD_LOCATION"] = settings.vertex_ai_location


# ── Routes ──────────────────────────────────────────────────────────────────

@router.post("/conversations", response_model=ConversationOut, status_code=201)
async def create_conversation(
    body: ConversationCreate,
    user: CurrentUser = Depends(get_approved_user),
):
    async with AsyncSessionLocal() as db:
        if body.project_id:
            result = await db.execute(
                select(Project).where(
                    and_(
                        Project.id == body.project_id,
                        or_(
                            Project.owner_id == user.id,
                            Project.id.in_(
                                select(ProjectMembership.project_id).where(
                                    ProjectMembership.user_id == user.id
                                )
                            ),
                        ),
                    )
                )
            )
            if not result.scalar_one_or_none():
                raise HTTPException(status_code=404, detail="Project not found")

        conv = AiConversation(
            user_id=user.id,
            project_id=body.project_id,
            title=body.title,
            messages=[],
        )
        db.add(conv)
        await db.commit()
        await db.refresh(conv)

        pt = await _project_title(body.project_id, db)
        return _conv_out(conv, pt)


@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(
    user: CurrentUser = Depends(get_approved_user),
):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AiConversation, Project.title.label("project_title"))
            .outerjoin(Project, AiConversation.project_id == Project.id)
            .where(AiConversation.user_id == user.id)
            .order_by(AiConversation.updated_at.desc())
        )
        return [
            ConversationOut(
                id=str(conv.id),
                title=conv.title,
                project_id=str(conv.project_id) if conv.project_id else None,
                project_title=pt,
                message_count=len(conv.messages or []),
                created_at=conv.created_at.isoformat(),
                updated_at=conv.updated_at.isoformat(),
            )
            for conv, pt in result.all()
        ]


@router.get("/conversations/{conv_id}", response_model=ConversationDetail)
async def get_conversation(
    conv_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
):
    async with AsyncSessionLocal() as db:
        conv = await _assert_conv_owner(conv_id, user.id, db)
        pt = await _project_title(conv.project_id, db)

        project_files: list[ProjectFileOut] | None = None
        if conv.project_id:
            files_result = await db.execute(
                select(FileModel).where(
                    and_(
                        FileModel.project_id == conv.project_id,
                        FileModel.upload_status == "uploaded",
                    )
                )
            )
            project_files = [
                ProjectFileOut(
                    id=str(f.id),
                    filename=f.original_name,
                    gcs_uri=f.gcs_uri,
                )
                for f in files_result.scalars().all()
            ]

        msgs = [MessageOut(**m) for m in (conv.messages or [])]

        return ConversationDetail(
            id=str(conv.id),
            title=conv.title,
            project_id=str(conv.project_id) if conv.project_id else None,
            project_title=pt,
            message_count=len(msgs),
            created_at=conv.created_at.isoformat(),
            updated_at=conv.updated_at.isoformat(),
            messages=msgs,
            project_files=project_files,
        )


@router.patch("/conversations/{conv_id}", response_model=ConversationOut)
async def update_conversation(
    conv_id: UUID,
    body: ConversationUpdate,
    user: CurrentUser = Depends(get_approved_user),
):
    async with AsyncSessionLocal() as db:
        conv = await _assert_conv_owner(conv_id, user.id, db)

        if body.title is not None:
            conv.title = body.title
        if body.clear_project:
            conv.project_id = None
        elif body.project_id is not None:
            conv.project_id = body.project_id

        await db.commit()
        await db.refresh(conv)

        pt = await _project_title(conv.project_id, db)
        return _conv_out(conv, pt)


@router.delete("/conversations/{conv_id}", status_code=204)
async def delete_conversation(
    conv_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
):
    async with AsyncSessionLocal() as db:
        conv = await _assert_conv_owner(conv_id, user.id, db)
        await db.delete(conv)
        await db.commit()


@router.post("/conversations/{conv_id}/ask", response_model=AskResponse)
async def ask_in_conversation(
    conv_id: UUID,
    question: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    user: CurrentUser = Depends(get_approved_user),
):
    """Ask a question in a conversation.

    - If the conversation is linked to a project, the project's uploaded files
      are sent to Gemini via GCS URIs plus the latest DD report as text context.
    - Otherwise, the caller must upload files directly (same as the old /bbox-lab/ask).
    """
    import asyncio

    async with AsyncSessionLocal() as db:
        conv = await _assert_conv_owner(conv_id, user.id, db)

        file_names: list[str] = []

        if conv.project_id:
            # ── Project-context mode ───────────────────────────────────────
            files_result = await db.execute(
                select(FileModel).where(
                    and_(
                        FileModel.project_id == conv.project_id,
                        FileModel.upload_status == "uploaded",
                    )
                )
            )
            project_files = files_result.scalars().all()

            dd_result = await db.execute(
                select(DDCheck)
                .where(
                    and_(
                        DDCheck.project_id == conv.project_id,
                        DDCheck.status == "completed",
                    )
                )
                .order_by(DDCheck.completed_at.desc())
                .limit(1)
            )
            dd_check = dd_result.scalar_one_or_none()

            if not project_files and not dd_check:
                raise HTTPException(
                    status_code=400,
                    detail="הפרויקט אינו מכיל מסמכים או דוח מוכן לניתוח",
                )

            file_names = [f.original_name for f in project_files]

            # Build rich text context from the DD report (preferred: no GCS issues).
            # Fall back to GCS file URIs only when no report exists yet.
            extra_context_parts: list[str] = []
            if file_names:
                extra_context_parts.append(
                    "מסמכי הפרויקט:\n" + "\n".join(f"- {n}" for n in file_names)
                )
            if dd_check and dd_check.report:
                report_json = json.dumps(dd_check.report, ensure_ascii=False)
                extra_context_parts.append(f"דוח DD של הפרויקט:\n{report_json[:80_000]}")

            if extra_context_parts:
                # Text-only path: fast, reliable, no GCS permissions needed.
                extra_context: str = "\n\n".join(extra_context_parts)
                resp = await asyncio.to_thread(
                    _run_ask_general,
                    question=question,
                    extra_context=extra_context,
                )
            else:
                # No DD report yet — fall back to GCS file reading.
                gcs_uris = [
                    (f.gcs_uri, f.content_type or "application/pdf", f.original_name)
                    for f in project_files
                ]
                try:
                    resp = await asyncio.to_thread(
                        _run_ask_with_gcs,
                        question=question,
                        gcs_uris=gcs_uris,
                        extra_context=None,
                    )
                except Exception as exc:
                    logger.error("_run_ask_with_gcs failed: %s", exc, exc_info=True)
                    raise HTTPException(
                        status_code=502,
                        detail=f"שגיאה בקריאת המסמכים: {exc}",
                    ) from exc
        else:
            # ── Upload mode or general chat (no files) ────────────────────
            file_entries: list[tuple[bytes, str]] = []
            for f in files:
                ct = f.content_type or ""
                if not ct.startswith("image/") and ct != "application/pdf":
                    raise HTTPException(
                        status_code=400,
                        detail=f"קובץ חייב להיות PDF או תמונה: {f.filename}",
                    )
                data = await f.read()
                if data:
                    file_entries.append((data, ct))
                    file_names.append(f.filename or "")

            if file_entries:
                from app.api.bbox_lab import _run_ask
                resp = await asyncio.to_thread(
                    _run_ask,
                    question=question,
                    file_entries=file_entries,
                )
            else:
                # ── General chat — no documents ────────────────────────────
                resp = await asyncio.to_thread(_run_ask_general, question=question)

        # ── Persist messages ────────────────────────────────────────────
        now_iso = _utcnow().isoformat()
        user_msg = {
            "id": str(uuid4()),
            "role": "user",
            "content": question,
            "file_names": file_names or None,
            "created_at": now_iso,
        }
        assistant_msg = {
            "id": str(uuid4()),
            "role": "assistant",
            "content": resp.answer,
            "citations": [c.model_dump() for c in resp.citations],
            "tokens": (
                resp.raw_token_usage.get("total_tokens") if resp.raw_token_usage else None
            ),
            "created_at": _utcnow().isoformat(),
        }

        messages = list(conv.messages or [])
        messages.extend([user_msg, assistant_msg])
        conv.messages = messages
        flag_modified(conv, "messages")

        if not conv.title and len(messages) <= 2:
            conv.title = question[:60]

        await db.commit()

        return AskResponse(
            answer=resp.answer,
            citations=[c.model_dump() for c in resp.citations],
            model_used=resp.model_used,
            raw_token_usage=resp.raw_token_usage,
            conversation_id=str(conv.id),
        )


# ── Gemini helpers ───────────────────────────────────────────────────────────

def _run_ask_general(*, question: str, extra_context: str | None = None) -> object:
    """Call Gemini with a plain text question (+ optional project context)."""
    from google import genai
    from google.genai import types

    _ensure_genai_env()

    client = genai.Client(http_options=types.HttpOptions(api_version="v1"))
    config = types.GenerateContentConfig(
        system_instruction=(
            "You are D-DONE AI, an expert assistant specialising in real estate finance, "
            "legal due diligence, and Israeli real estate transactions. "
            "Answer questions clearly and concisely in the language of the question. "
            "Respond with a JSON object: {\"answer\": \"<your answer>\", \"citations\": []}."
        ),
        temperature=0.4,
        response_mime_type="application/json",
        max_output_tokens=8192,
    )
    content = (extra_context + "\n\n" + question) if extra_context else question
    response = client.models.generate_content(
        model=GEMINI_CHAT_MODEL,
        contents=[types.Content(role="user", parts=[types.Part.from_text(text=content)])],
        config=config,
    )
    import json as _json
    raw = (response.text or "").strip()
    try:
        data = _json.loads(raw)
    except _json.JSONDecodeError:
        data = {"answer": raw, "citations": []}
    if not isinstance(data, dict):
        data = {"answer": str(data), "citations": []}

    from app.api.bbox_lab import AskResponse as _AskResp
    return _AskResp(
        answer=data.get("answer", ""),
        citations=[],
        raw_token_usage=None,
        model_used=GEMINI_CHAT_MODEL,
    )


def _run_ask_with_gcs(
    *,
    question: str,
    gcs_uris: list[tuple[str, str, str]],
    extra_context: str | None,
) -> object:
    """Call Gemini with GCS-referenced files instead of inline bytes."""
    from app.api.bbox_lab import ASK_SYSTEM_INSTRUCTION, AskCitation, AskResponse as _AskResp

    _ensure_genai_env()

    import json as _json
    from google import genai
    from google.genai import types

    client = genai.Client(http_options=types.HttpOptions(api_version="v1"))

    safety = [
        types.SafetySetting(
            category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold=types.HarmBlockThreshold.BLOCK_ONLY_HIGH,
        ),
    ]
    config = types.GenerateContentConfig(
        system_instruction=ASK_SYSTEM_INSTRUCTION,
        temperature=0.3,
        safety_settings=safety,
        response_mime_type="application/json",
        max_output_tokens=16_384,
    )

    parts: list[types.Part] = []
    for gcs_uri, mime_type, _name in gcs_uris:
        parts.append(types.Part.from_uri(file_uri=gcs_uri, mime_type=mime_type))

    if extra_context:
        parts.append(types.Part.from_text(text=extra_context))

    parts.append(types.Part.from_text(text=question))

    logger.info(
        "Ask-GCS: model=%s files=%d has_context=%s question=%s",
        GEMINI_FILES_MODEL,
        len(gcs_uris),
        bool(extra_context),
        question[:100],
    )

    response = client.models.generate_content(
        model=GEMINI_FILES_MODEL,
        contents=[types.Content(role="user", parts=parts)],
        config=config,
    )

    raw_text = (response.text or "").strip()
    try:
        data = _json.loads(raw_text)
    except _json.JSONDecodeError:
        json_start = raw_text.find("{")
        json_end = raw_text.rfind("}")
        if json_start != -1 and json_end > json_start:
            try:
                data = _json.loads(raw_text[json_start : json_end + 1])
            except _json.JSONDecodeError:
                data = {"answer": raw_text, "citations": []}
        else:
            data = {"answer": raw_text, "citations": []}

    if isinstance(data, list):
        answers: list[str] = []
        flat_citations: list[dict] = []
        for item in data:
            if isinstance(item, dict):
                if "answer" in item:
                    answers.append(item["answer"])
                for c in item.get("citations", []):
                    if isinstance(c, dict):
                        flat_citations.append(c)
        data = {"answer": "\n".join(answers), "citations": flat_citations}
    if not isinstance(data, dict):
        data = {"answer": str(data), "citations": []}

    citations: list[AskCitation] = []
    for c in data.get("citations", []):
        if not isinstance(c, dict) or "box_2d" not in c:
            continue
        box = c["box_2d"]
        if isinstance(box, list) and len(box) > 0 and isinstance(box[0], list):
            box = box[0]
        if not (isinstance(box, list) and len(box) == 4):
            continue
        try:
            citations.append(
                AskCitation(
                    box_2d=[int(v) for v in box],
                    label=c.get("label", ""),
                    page=int(c.get("page", 1)),
                )
            )
        except (ValueError, TypeError):
            logger.warning("Skipping malformed citation: %s", c)

    token_usage = None
    if response.usage_metadata:
        um = response.usage_metadata
        token_usage = {
            "prompt_tokens": getattr(um, "prompt_token_count", None),
            "candidates_tokens": getattr(um, "candidates_token_count", None),
            "total_tokens": getattr(um, "total_token_count", None),
        }

    logger.info("Ask-GCS complete: %d citations, tokens=%s", len(citations), token_usage)

    return _AskResp(
        answer=data.get("answer", "") or raw_text,
        citations=citations,
        model_used=GEMINI_FILES_MODEL,
        raw_token_usage=token_usage,
    )
