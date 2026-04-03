"""Shared PDF injection helpers for extractors (used by eval harnesses)."""

from __future__ import annotations

from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from app.agents.constants import (
    STATE_DOC_CLASSIFICATION,
    STATE_DOCUMENT_NAMES,
    STATE_GCS_URIS,
)


def build_manifest(doc_names: list[str]) -> str:
    numbered = "\n".join(f"{i + 1}. {name}" for i, name in enumerate(doc_names))
    return (
        f"## Documents ({len(doc_names)}) — VALID FILENAMES\n\n"
        + numbered
        + "\n\nCRITICAL: When populating `source_document_name`, "
        "you MUST copy the filename EXACTLY as it appears in this list. "
        "Do NOT invent, shorten, or paraphrase any filename."
    )


def inject_pdfs(callback_context: CallbackContext, llm_request: LlmRequest) -> None:
    """Inject all project PDFs into the request (used by classifier)."""
    gcs_uris: list[str] = callback_context.state.get(STATE_GCS_URIS, [])
    doc_names: list[str] = callback_context.state.get(STATE_DOCUMENT_NAMES, [])

    if not gcs_uris:
        return None

    parts: list[types.Part] = [
        types.Part.from_uri(file_uri=uri, mime_type="application/pdf")
        for uri in gcs_uris
    ]
    parts.append(types.Part.from_text(text=build_manifest(doc_names)))
    llm_request.contents.insert(0, types.Content(role="user", parts=parts))
    return None


def make_inject_pdfs(accepted_types: list[str], empty_json: str):
    """Return a before_model_callback that injects only files matching accepted_types.

    When no matching files exist the callback short-circuits the LLM call by
    returning an LlmResponse directly with the schema's minimal empty JSON.
    """

    def _callback(
        callback_context: CallbackContext, llm_request: LlmRequest
    ) -> LlmResponse | None:
        classification_result: dict = (
            callback_context.state.get(STATE_DOC_CLASSIFICATION) or {}
        )
        classifications: dict[str, str] = classification_result.get(
            "classifications", {}
        )
        all_uris: list[str] = callback_context.state.get(STATE_GCS_URIS, [])
        all_names: list[str] = callback_context.state.get(STATE_DOCUMENT_NAMES, [])

        matched_pairs = [
            (uri, name)
            for uri, name in zip(all_uris, all_names)
            if classifications.get(name) in accepted_types
        ]

        if not matched_pairs:
            return LlmResponse(
                content=types.Content(
                    role="model",
                    parts=[types.Part.from_text(text=empty_json)],
                )
            )

        parts: list[types.Part] = [
            types.Part.from_uri(file_uri=uri, mime_type="application/pdf")
            for uri, _ in matched_pairs
        ]
        parts.append(types.Part.from_text(text=build_manifest(all_names)))
        llm_request.contents.insert(0, types.Content(role="user", parts=parts))
        return None

    return _callback
