"""Notebook API — NotebookLM-style document Q&A.

Routes
------
POST   /notebooks                          — create a new notebook
GET    /notebooks                          — list notebooks (own + org)
GET    /notebooks/{id}                     — get notebook with sources + messages
PATCH  /notebooks/{id}                     — rename
DELETE /notebooks/{id}                     — delete

POST   /notebooks/{id}/sources             — upload source documents (multipart PDF)
DELETE /notebooks/{id}/sources/{source_id} — remove a source

POST   /notebooks/{id}/chat                — send message (SSE stream)
DELETE /notebooks/{id}/chat                — clear chat history
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.core.auth import CurrentUser, get_approved_user
from app.db.models import Notebook, NotebookMessage, NotebookSource
from app.db.session import AsyncSessionLocal

router = APIRouter(prefix="/notebooks", tags=["notebooks"])
logger = logging.getLogger(__name__)


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class NotebookSourceOut(BaseModel):
    id: str
    original_name: str
    gcs_uri: str
    file_size_bytes: int | None
    created_at: str


class NotebookMessageOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: str


class NotebookOut(BaseModel):
    id: str
    title: str
    source_count: int
    message_count: int
    created_at: str
    updated_at: str


class NotebookDetailOut(BaseModel):
    id: str
    title: str
    sources: list[NotebookSourceOut]
    messages: list[NotebookMessageOut]
    created_at: str
    updated_at: str


class CreateNotebookRequest(BaseModel):
    title: str = "Untitled Notebook"


class RenameNotebookRequest(BaseModel):
    title: str


class ChatRequest(BaseModel):
    message: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _source_out(s: NotebookSource) -> NotebookSourceOut:
    return NotebookSourceOut(
        id=str(s.id),
        original_name=s.original_name,
        gcs_uri=s.gcs_uri,
        file_size_bytes=s.file_size_bytes,
        created_at=s.created_at.isoformat(),
    )


def _msg_out(m: NotebookMessage) -> NotebookMessageOut:
    return NotebookMessageOut(
        id=str(m.id),
        role=m.role,
        content=m.content,
        created_at=m.created_at.isoformat(),
    )


def _notebook_out(nb: Notebook) -> NotebookOut:
    return NotebookOut(
        id=str(nb.id),
        title=nb.title,
        source_count=len(nb.sources),
        message_count=len(nb.messages),
        created_at=nb.created_at.isoformat(),
        updated_at=nb.updated_at.isoformat(),
    )


async def _get_notebook(notebook_id: UUID, user: CurrentUser, db) -> Notebook:
    result = await db.execute(
        select(Notebook).where(
            Notebook.id == notebook_id,
            Notebook.created_by_id == user.id,
            Notebook.is_deleted.is_(False),
        )
    )
    nb = result.scalar_one_or_none()
    if not nb:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return nb


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("", response_model=NotebookDetailOut, status_code=201)
async def create_notebook(
    body: CreateNotebookRequest,
    user: CurrentUser = Depends(get_approved_user),
):
    async with AsyncSessionLocal() as db:
        nb = Notebook(
            created_by_id=user.id,
            organization_id=user.organization_id,
            title=body.title,
        )
        db.add(nb)
        await db.commit()
        await db.refresh(nb)
        return NotebookDetailOut(
            id=str(nb.id),
            title=nb.title,
            sources=[],
            messages=[],
            created_at=nb.created_at.isoformat(),
            updated_at=nb.updated_at.isoformat(),
        )


@router.get("", response_model=list[NotebookOut])
async def list_notebooks(
    user: CurrentUser = Depends(get_approved_user),
):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Notebook)
            .where(Notebook.created_by_id == user.id, Notebook.is_deleted.is_(False))
            .order_by(Notebook.updated_at.desc())
        )
        notebooks = result.scalars().all()
        # Eagerly load relationships for count
        for nb in notebooks:
            await db.refresh(nb, ["sources", "messages"])
        return [_notebook_out(nb) for nb in notebooks]


@router.get("/{notebook_id}", response_model=NotebookDetailOut)
async def get_notebook(
    notebook_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
):
    async with AsyncSessionLocal() as db:
        nb = await _get_notebook(notebook_id, user, db)
        await db.refresh(nb, ["sources", "messages"])
        return NotebookDetailOut(
            id=str(nb.id),
            title=nb.title,
            sources=[_source_out(s) for s in nb.sources],
            messages=[_msg_out(m) for m in nb.messages],
            created_at=nb.created_at.isoformat(),
            updated_at=nb.updated_at.isoformat(),
        )


@router.patch("/{notebook_id}", response_model=NotebookOut)
async def rename_notebook(
    notebook_id: UUID,
    body: RenameNotebookRequest,
    user: CurrentUser = Depends(get_approved_user),
):
    async with AsyncSessionLocal() as db:
        nb = await _get_notebook(notebook_id, user, db)
        await db.refresh(nb, ["sources", "messages"])
        nb.title = body.title.strip() or "Untitled Notebook"
        await db.commit()
        await db.refresh(nb)
        return _notebook_out(nb)


@router.delete("/{notebook_id}", status_code=204)
async def delete_notebook(
    notebook_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
):
    async with AsyncSessionLocal() as db:
        nb = await _get_notebook(notebook_id, user, db)
        nb.is_deleted = True
        await db.commit()


@router.post("/{notebook_id}/sources", response_model=list[NotebookSourceOut])
async def upload_sources(
    notebook_id: UUID,
    files: list[UploadFile],
    user: CurrentUser = Depends(get_approved_user),
):
    """Upload one or more PDF files as sources for the notebook."""
    from app.services.gcs import upload_bytes_to_gcs

    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    async with AsyncSessionLocal() as db:
        nb = await _get_notebook(notebook_id, user, db)
        new_sources: list[NotebookSource] = []

        for f in files:
            content = await f.read()
            if not content:
                continue
            safe_name = f.filename or "document.pdf"
            object_name = f"notebooks/{notebook_id}/{uuid.uuid4()}_{safe_name}"
            gcs_uri = await asyncio.to_thread(
                upload_bytes_to_gcs, content, object_name, f.content_type or "application/pdf"
            )
            source = NotebookSource(
                notebook_id=nb.id,
                original_name=safe_name,
                gcs_uri=gcs_uri,
                file_size_bytes=len(content),
            )
            db.add(source)
            new_sources.append(source)

        if not new_sources:
            raise HTTPException(status_code=400, detail="All uploaded files were empty.")

        await db.commit()
        for s in new_sources:
            await db.refresh(s)

        return [_source_out(s) for s in new_sources]


@router.delete("/{notebook_id}/sources/{source_id}", status_code=204)
async def delete_source(
    notebook_id: UUID,
    source_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
):
    async with AsyncSessionLocal() as db:
        await _get_notebook(notebook_id, user, db)
        result = await db.execute(
            select(NotebookSource).where(
                NotebookSource.id == source_id,
                NotebookSource.notebook_id == notebook_id,
            )
        )
        source = result.scalar_one_or_none()
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")
        await db.delete(source)
        await db.commit()


@router.post("/{notebook_id}/chat")
async def chat(
    notebook_id: UUID,
    body: ChatRequest,
    user: CurrentUser = Depends(get_approved_user),
):
    """Send a message and get a streaming response grounded in the notebook's sources.

    SSE event types:
    - ``{"type": "chunk", "text": "..."}``
    - ``{"type": "done"}``
    - ``{"type": "error", "message": "..."}``
    """
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    async with AsyncSessionLocal() as db:
        nb = await _get_notebook(notebook_id, user, db)
        await db.refresh(nb, ["sources", "messages"])

        if not nb.sources:
            raise HTTPException(status_code=400, detail="Add at least one source document before chatting.")

        sources_snapshot = [{"id": str(s.id), "name": s.original_name, "gcs_uri": s.gcs_uri} for s in nb.sources]
        history_snapshot = [{"role": m.role, "content": m.content} for m in nb.messages]

    async def generate():
        from google import genai
        from google.genai import types
        from app.agents.builder.builder_llm import _ensure_genai_env
        _ensure_genai_env()

        client = genai.Client(http_options=types.HttpOptions(api_version="v1"))

        # Build source listing for the system prompt
        source_list = "\n".join(
            f"[{i+1}] {s['name']}" for i, s in enumerate(sources_snapshot)
        )

        system_prompt = (
            "You are an AI research assistant helping lawyers analyze legal documents.\n\n"
            f"You have access to {len(sources_snapshot)} document(s):\n{source_list}\n\n"
            "Instructions:\n"
            "- Answer questions thoroughly based on these documents.\n"
            "- When referencing specific information, use inline citations like [1], [2] "
            "matching the document numbers above.\n"
            "- If information spans multiple documents, cite all relevant ones.\n"
            "- If a question cannot be answered from the documents, say so clearly.\n"
            "- Answer in the same language as the user's question.\n"
            "- Be thorough and precise — you are assisting legal professionals."
        )

        # Source document parts (all sources included in every request)
        source_parts = [
            types.Part.from_uri(file_uri=s["gcs_uri"], mime_type="application/pdf")
            for s in sources_snapshot
        ]

        # Rebuild conversation history as Gemini Content objects
        contents: list[types.Content] = []

        # First message must include the source documents
        if history_snapshot:
            first_user_content = history_snapshot[0]["content"]
            contents.append(types.Content(
                role="user",
                parts=source_parts + [types.Part.from_text(text=first_user_content)],
            ))
            for msg in history_snapshot[1:]:
                contents.append(types.Content(
                    role=msg["role"],
                    parts=[types.Part.from_text(text=msg["content"])],
                ))

        # Append current user message (with sources if it's the first ever)
        if not history_snapshot:
            contents.append(types.Content(
                role="user",
                parts=source_parts + [types.Part.from_text(text=body.message)],
            ))
        else:
            contents.append(types.Content(
                role="user",
                parts=[types.Part.from_text(text=body.message)],
            ))

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.2,
            max_output_tokens=8192,
        )

        full_response = ""
        try:
            async for chunk in await client.aio.models.generate_content_stream(
                model="gemini-2.5-flash",
                contents=contents,
                config=config,
            ):
                if chunk.text:
                    full_response += chunk.text
                    yield f"data: {json.dumps({'type': 'chunk', 'text': chunk.text}, ensure_ascii=False)}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as exc:
            logger.exception("Notebook chat error: notebook=%s", notebook_id)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
            return

        # Persist both messages after successful stream
        try:
            async with AsyncSessionLocal() as db2:
                db2.add(NotebookMessage(notebook_id=notebook_id, role="user", content=body.message))
                db2.add(NotebookMessage(notebook_id=notebook_id, role="model", content=full_response))
                # Touch notebook updated_at
                nb2_result = await db2.execute(select(Notebook).where(Notebook.id == notebook_id))
                nb2 = nb2_result.scalar_one_or_none()
                if nb2:
                    from sqlalchemy.orm.attributes import flag_modified
                    nb2.updated_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
                    flag_modified(nb2, "updated_at")
                await db2.commit()
        except Exception:
            logger.exception("Failed to persist notebook messages for notebook=%s", notebook_id)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("/{notebook_id}/chat", status_code=204)
async def clear_chat(
    notebook_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
):
    """Delete all messages in the notebook (keeps sources)."""
    async with AsyncSessionLocal() as db:
        await _get_notebook(notebook_id, user, db)
        result = await db.execute(
            select(NotebookMessage).where(NotebookMessage.notebook_id == notebook_id)
        )
        for msg in result.scalars().all():
            await db.delete(msg)
        await db.commit()
