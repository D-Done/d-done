"""Builder LLM — conversational agent configuration via Gemini function calling."""

from __future__ import annotations

import json
import logging
import os
from typing import AsyncGenerator

logger = logging.getLogger(__name__)

_BUILDER_MODEL = "gemini-2.5-flash"

# Function declaration for Gemini tool calling
_UPDATE_STATE_FUNC = {
    "name": "update_internal_agent_state",
    "description": (
        "Silently update the hidden internal configuration for the agent being designed. "
        "Call this whenever you have enough information to define or improve any field. "
        "This call is never shown to the user."
    ),
}


def _ensure_genai_env() -> None:
    use_vertex = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").strip().lower() in {
        "1", "true", "yes",
    }
    if use_vertex or not os.environ.get("GEMINI_API_KEY"):
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"
        from app.core.config import settings
        if settings.gcp_project_id and not os.environ.get("GOOGLE_CLOUD_PROJECT"):
            os.environ["GOOGLE_CLOUD_PROJECT"] = settings.gcp_project_id
        if settings.vertex_ai_location and not os.environ.get("GOOGLE_CLOUD_LOCATION"):
            os.environ["GOOGLE_CLOUD_LOCATION"] = settings.vertex_ai_location


async def stream_builder_response(
    *,
    messages: list[dict],
    new_user_message: str,
    attached_file_names: list[str],
) -> AsyncGenerator[dict, None]:
    """Stream the Builder LLM response with optional tool call interception.

    Yields dicts with ``type`` in:
    - ``"chunk"``        — text token to forward to the client
    - ``"state_update"`` — tool call result (hidden from client); contains ``state`` dict
    - ``"done"``         — stream complete; contains ``full_text`` and ``state_update``
    - ``"error"``        — unrecoverable error; contains ``message``
    """
    from google import genai
    from google.genai import types
    from app.agents.builder.prompt import BUILDER_SYSTEM_PROMPT

    _ensure_genai_env()
    client = genai.Client(http_options=types.HttpOptions(api_version="v1"))

    # Build multi-turn contents from stored history
    contents: list[types.Content] = []
    for msg in messages:
        role = "model" if msg["role"] == "assistant" else "user"
        contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])]))

    # Append file names to the new user message as context
    user_text = new_user_message
    if attached_file_names:
        files_note = "\n\n[Reference documents attached: " + ", ".join(attached_file_names) + "]"
        user_text = user_text + files_note

    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=user_text)]))

    # Tool declaration — use STRING types throughout to avoid Vertex AI schema restrictions
    tool = types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name=_UPDATE_STATE_FUNC["name"],
                description=_UPDATE_STATE_FUNC["description"],
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "name": types.Schema(
                            type=types.Type.STRING,
                            description="Short descriptive name of the agent in the user's language",
                        ),
                        "description": types.Schema(
                            type=types.Type.STRING,
                            description="1–2 sentence plain-language description of what this agent does",
                        ),
                        "system_prompt": types.Schema(
                            type=types.Type.STRING,
                            description="Complete, professionally written system prompt for the agent",
                        ),
                        "extracted_fields_schema": types.Schema(
                            type=types.Type.STRING,
                            description=(
                                "JSON string encoding the extraction schema object. "
                                "Keys are field names; values have description, type, is_red_flag."
                            ),
                        ),
                    },
                    required=[],
                ),
            )
        ]
    )

    config = types.GenerateContentConfig(
        system_instruction=BUILDER_SYSTEM_PROMPT,
        tools=[tool],
        temperature=0.5,
        max_output_tokens=4096,
    )

    full_text = ""
    state_update: dict | None = None

    try:
        async for chunk in await client.aio.models.generate_content_stream(
            model=_BUILDER_MODEL,
            contents=contents,
            config=config,
        ):
            if not chunk.candidates:
                continue
            candidate = chunk.candidates[0]
            if not candidate.content or not candidate.content.parts:
                continue

            for part in candidate.content.parts:
                # Function call part — extract state update, never yield text for it
                if part.function_call is not None:
                    fc = part.function_call
                    if fc.name == "update_internal_agent_state":
                        raw_args = dict(fc.args) if fc.args else {}
                        # Parse extracted_fields_schema if it's a JSON string
                        schema_raw = raw_args.get("extracted_fields_schema")
                        if isinstance(schema_raw, str):
                            try:
                                raw_args["extracted_fields_schema"] = json.loads(schema_raw)
                            except (json.JSONDecodeError, ValueError):
                                raw_args.pop("extracted_fields_schema", None)
                        state_update = raw_args
                        yield {"type": "state_update", "state": state_update}

                elif part.text:
                    full_text += part.text
                    yield {"type": "chunk", "text": part.text}

    except Exception as exc:
        logger.exception("Builder LLM stream error")
        yield {"type": "error", "message": str(exc)}
        return

    yield {"type": "done", "full_text": full_text, "state_update": state_update}
