"""Custom AI Agent Builder API.

Routes
------
POST /agents/builder/start                      — create a new draft agent (returns agent_id)
POST /agents/builder/{agent_id}/chat            — multi-turn builder conversation (SSE stream)
POST /agents/builder/{agent_id}/files/initiate  — start GCS upload for a reference doc
POST /agents/builder/{agent_id}/files/complete  — register uploaded reference doc on agent
POST /agents/{agent_id}/publish                 — finalize draft → published
GET  /agents                                    — list published agents for the current user
GET  /agents/drafts                             — list draft agents for the current user
GET  /agents/{agent_id}                         — get agent details
POST /agents/{agent_id}/run                     — run agent on a project (SSE stream)
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.orm.attributes import flag_modified

from app.core.auth import CurrentUser, get_approved_user
from app.db.models import CustomAgent
from app.db.session import AsyncSessionLocal

router = APIRouter(prefix="/agents", tags=["agents"])
logger = logging.getLogger(__name__)


# ── Pydantic schemas ─────────────────────────────────────────────────────────

class StartBuilderResponse(BaseModel):
    agent_id: str


class BuilderChatRequest(BaseModel):
    message: str
    attached_file_ids: list[str] = []


class AgentPreview(BaseModel):
    agent_id: str
    name: str | None
    description: str | None
    knowledge_base_files: list[dict]
    status: str


class AgentOut(BaseModel):
    id: str
    name: str | None
    description: str | None
    status: str
    knowledge_base_files: list[dict]
    extracted_fields_schema: dict | None
    created_at: str
    updated_at: str


class InitiateFileRequest(BaseModel):
    filename: str
    content_type: str = "application/pdf"
    file_size_bytes: int | None = None


class InitiateFileResponse(BaseModel):
    upload_url: str
    file_id: str
    gcs_uri: str


class CompleteFileRequest(BaseModel):
    file_id: str
    original_name: str
    gcs_uri: str
    file_size_bytes: int | None = None


class RunAgentRequest(BaseModel):
    project_id: str


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _get_own_agent(agent_id: UUID, user_id: UUID, db) -> CustomAgent:
    result = await db.execute(
        select(CustomAgent).where(
            CustomAgent.id == agent_id,
            CustomAgent.created_by_id == user_id,
            CustomAgent.is_deleted.is_(False),
        )
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


def _to_agent_out(agent: CustomAgent) -> AgentOut:
    return AgentOut(
        id=str(agent.id),
        name=agent.name,
        description=agent.description,
        status=agent.status,
        knowledge_base_files=list(agent.knowledge_base_files or []),
        extracted_fields_schema=agent.extracted_fields_schema,
        created_at=agent.created_at.isoformat(),
        updated_at=agent.updated_at.isoformat(),
    )


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/builder/start", response_model=StartBuilderResponse, status_code=201)
async def start_builder_session(
    user: CurrentUser = Depends(get_approved_user),
):
    """Create a new draft agent — returns its ID for use as the builder session key."""
    async with AsyncSessionLocal() as db:
        agent = CustomAgent(
            created_by_id=user.id,
            organization_id=user.organization_id,
            status="draft",
            builder_messages=[],
            knowledge_base_files=[],
        )
        db.add(agent)
        await db.commit()
        await db.refresh(agent)
        return StartBuilderResponse(agent_id=str(agent.id))


@router.post("/builder/{agent_id}/chat")
async def builder_chat(
    agent_id: UUID,
    body: BuilderChatRequest,
    user: CurrentUser = Depends(get_approved_user),
):
    """Multi-turn conversational builder — returns SSE stream.

    SSE event types:
    - ``{"type": "chunk", "text": "..."}``           — text token to display
    - ``{"type": "state_update", "preview": {...}}``  — preview panel refresh (name, description)
    - ``{"type": "done", "agent_id": "..."}``         — stream complete
    - ``{"type": "error", "message": "..."}``         — unrecoverable error
    """
    async with AsyncSessionLocal() as db:
        agent = await _get_own_agent(agent_id, user.id, db)
        messages = list(agent.builder_messages or [])
        kb_files: list[dict] = list(agent.knowledge_base_files or [])

    # Resolve attached file names from KB files already on the agent
    attached_names = [
        f.get("original_name", f.get("file_id", ""))
        for f in kb_files
        if f.get("file_id") in body.attached_file_ids
    ]

    from app.agents.builder.builder_llm import stream_builder_response

    async def generate():
        full_text = ""
        state_update: dict | None = None

        try:
            async for event in stream_builder_response(
                messages=messages,
                new_user_message=body.message,
                attached_file_names=attached_names,
            ):
                etype = event.get("type")

                if etype == "chunk":
                    full_text += event["text"]
                    yield f"data: {json.dumps({'type': 'chunk', 'text': event['text']}, ensure_ascii=False)}\n\n"

                elif etype == "state_update":
                    state_update = event["state"]
                    # Only expose name + description to the frontend — never system_prompt
                    preview = {
                        "name": state_update.get("name"),
                        "description": state_update.get("description"),
                        "has_extraction_schema": bool(state_update.get("extracted_fields_schema")),
                    }
                    yield f"data: {json.dumps({'type': 'state_update', 'preview': preview}, ensure_ascii=False)}\n\n"

                elif etype == "error":
                    yield f"data: {json.dumps({'type': 'error', 'message': event.get('message', 'Unknown error')})}\n\n"
                    return

                elif etype == "done":
                    full_text = event.get("full_text", full_text)
                    state_update = event.get("state_update") or state_update

            # Persist conversation turns + any state updates
            async with AsyncSessionLocal() as db2:
                agent2 = await _get_own_agent(agent_id, user.id, db2)
                msgs = list(agent2.builder_messages or [])
                msgs.append({"role": "user", "content": body.message})
                msgs.append({"role": "assistant", "content": full_text})
                agent2.builder_messages = msgs
                flag_modified(agent2, "builder_messages")

                if state_update:
                    if state_update.get("name"):
                        agent2.name = state_update["name"]
                    if state_update.get("description"):
                        agent2.description = state_update["description"]
                    if state_update.get("system_prompt"):
                        agent2.system_prompt = state_update["system_prompt"]
                    if state_update.get("extracted_fields_schema"):
                        agent2.extracted_fields_schema = state_update["extracted_fields_schema"]
                        flag_modified(agent2, "extracted_fields_schema")

                await db2.commit()

            yield f"data: {json.dumps({'type': 'done', 'agent_id': str(agent_id)})}\n\n"

        except Exception as exc:
            logger.exception("Builder chat error for agent %s", agent_id)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/builder/{agent_id}/files/initiate", response_model=InitiateFileResponse)
async def initiate_kb_file_upload(
    agent_id: UUID,
    body: InitiateFileRequest,
    request: Request,
    user: CurrentUser = Depends(get_approved_user),
):
    """Start a GCS resumable upload for a knowledge-base reference document."""
    from app.services.gcs import create_resumable_session

    async with AsyncSessionLocal() as db:
        await _get_own_agent(agent_id, user.id, db)

    file_id = str(uuid.uuid4())
    origin = request.headers.get("origin")

    session_uri, gcs_uri = await asyncio.to_thread(
        create_resumable_session,
        project_id="agent-kb",
        original_filename=f"{file_id}_{body.filename}",
        content_type=body.content_type,
        origin=origin,
        folder=str(agent_id),
    )

    return InitiateFileResponse(
        upload_url=session_uri,
        file_id=file_id,
        gcs_uri=gcs_uri,
    )


@router.post("/builder/{agent_id}/files/complete", response_model=AgentPreview)
async def complete_kb_file_upload(
    agent_id: UUID,
    body: CompleteFileRequest,
    user: CurrentUser = Depends(get_approved_user),
):
    """Register a successfully uploaded reference document on the agent."""
    async with AsyncSessionLocal() as db:
        agent = await _get_own_agent(agent_id, user.id, db)
        kb_files = list(agent.knowledge_base_files or [])
        kb_files.append({
            "file_id": body.file_id,
            "original_name": body.original_name,
            "gcs_uri": body.gcs_uri,
            "size_bytes": body.file_size_bytes,
        })
        agent.knowledge_base_files = kb_files
        flag_modified(agent, "knowledge_base_files")
        await db.commit()
        await db.refresh(agent)
        return AgentPreview(
            agent_id=str(agent.id),
            name=agent.name,
            description=agent.description,
            knowledge_base_files=list(agent.knowledge_base_files),
            status=agent.status,
        )


@router.post("/{agent_id}/publish", response_model=AgentOut)
async def publish_agent(
    agent_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
):
    """Finalize the agent — move from draft to published."""
    async with AsyncSessionLocal() as db:
        agent = await _get_own_agent(agent_id, user.id, db)
        if not agent.name:
            raise HTTPException(
                status_code=400,
                detail="Agent must have a name before publishing. Continue the conversation.",
            )
        if not agent.system_prompt:
            raise HTTPException(
                status_code=400,
                detail="Agent configuration is not complete yet. Continue the conversation.",
            )
        agent.status = "published"
        await db.commit()
        await db.refresh(agent)
        return _to_agent_out(agent)


@router.get("", response_model=list[AgentOut])
async def list_agents(
    user: CurrentUser = Depends(get_approved_user),
):
    """List the current user's published agents."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CustomAgent)
            .where(
                CustomAgent.created_by_id == user.id,
                CustomAgent.is_deleted.is_(False),
                CustomAgent.status == "published",
            )
            .order_by(CustomAgent.created_at.desc())
        )
        return [_to_agent_out(a) for a in result.scalars().all()]


@router.get("/drafts", response_model=list[AgentOut])
async def list_draft_agents(
    user: CurrentUser = Depends(get_approved_user),
):
    """List the current user's draft agents."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CustomAgent)
            .where(
                CustomAgent.created_by_id == user.id,
                CustomAgent.is_deleted.is_(False),
                CustomAgent.status == "draft",
            )
            .order_by(CustomAgent.updated_at.desc())
        )
        return [_to_agent_out(a) for a in result.scalars().all()]


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(
    agent_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
):
    async with AsyncSessionLocal() as db:
        agent = await _get_own_agent(agent_id, user.id, db)
        return _to_agent_out(agent)


@router.post("/{agent_id}/run")
async def run_agent(
    agent_id: UUID,
    body: RunAgentRequest,
    user: CurrentUser = Depends(get_approved_user),
):
    """Run the published custom agent against a project's documents.

    Returns an SSE stream of:
    - ``{"type": "chunk", "text": "..."}``
    - ``{"type": "done"}``
    - ``{"type": "error", "message": "..."}``
    """
    from app.db.models import File as FileModel, Project, ProjectMembership

    async with AsyncSessionLocal() as db:
        agent = await _get_own_agent(agent_id, user.id, db)
        if agent.status != "published":
            raise HTTPException(status_code=400, detail="Agent must be published before running.")
        if not agent.system_prompt:
            raise HTTPException(status_code=400, detail="Agent has no system prompt.")

        system_prompt = agent.system_prompt
        kb_files = list(agent.knowledge_base_files or [])
        extracted_fields_schema = agent.extracted_fields_schema

        proj_result = await db.execute(
            select(Project).where(
                and_(
                    Project.id == UUID(body.project_id),
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
        project = proj_result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        files_result = await db.execute(
            select(FileModel).where(
                and_(
                    FileModel.project_id == UUID(body.project_id),
                    FileModel.upload_status == "uploaded",
                )
            )
        )
        project_files = files_result.scalars().all()

    if not project_files:
        raise HTTPException(status_code=400, detail="No uploaded documents found in this project.")

    async def generate():
        from google import genai
        from google.genai import types
        import os

        from app.agents.builder.builder_llm import _ensure_genai_env
        _ensure_genai_env()

        client = genai.Client(http_options=types.HttpOptions(api_version="v1"))

        schema_instruction = ""
        if extracted_fields_schema:
            schema_instruction = (
                "\n\nExtract the following structured fields:\n"
                + json.dumps(extracted_fields_schema, ensure_ascii=False, indent=2)
                + "\n\nReturn your findings in a structured JSON object."
            )

        # Knowledge base files (reference docs) come first
        kb_parts = [
            types.Part.from_uri(file_uri=f["gcs_uri"], mime_type="application/pdf")
            for f in kb_files
            if f.get("gcs_uri")
        ]
        # Project documents to analyze
        doc_parts = [
            types.Part.from_uri(
                file_uri=f.gcs_uri,
                mime_type=f.content_type or "application/pdf",
            )
            for f in project_files
        ]
        instruction_part = types.Part.from_text(
            text=f"Please analyze the provided documents according to your instructions.{schema_instruction}"
        )

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.3,
            max_output_tokens=16384,
        )

        try:
            async for chunk in await client.aio.models.generate_content_stream(
                model="gemini-2.5-flash",
                contents=[types.Content(role="user", parts=kb_parts + doc_parts + [instruction_part])],
                config=config,
            ):
                if chunk.text:
                    yield f"data: {json.dumps({'type': 'chunk', 'text': chunk.text}, ensure_ascii=False)}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as exc:
            logger.exception("Agent run error: agent=%s project=%s", agent_id, body.project_id)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
