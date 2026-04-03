"""Standalone Bbox Lab API — test Gemini bounding-box extraction on a PDF.

Upload a file (or reference an existing GCS URI) and run Gemini 3 Flash/Pro
on it to extract text with bounding boxes. No DD pipeline, no DocAI, no
agents — just raw Gemini multimodal bbox extraction.

Uses the official Vertex AI bounding box detection pattern:
https://docs.cloud.google.com/vertex-ai/generative-ai/docs/bounding-box-detection
"""

from __future__ import annotations

import logging
import os
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.core.auth import CurrentUser, get_approved_user
from app.core.config import settings

router = APIRouter(prefix="/bbox-lab", tags=["bbox-lab"])
logger = logging.getLogger(__name__)

GEMINI_MODELS = {
    "flash": "gemini-3-flash-preview",
    "pro": "gemini-3-pro-preview",
}
GEMINI_31_PRO = "gemini-3.1-pro-preview"

SYSTEM_INSTRUCTION = """\
You are a precise document OCR engine that returns bounding boxes for text.

Return bounding boxes as a JSON array. Each entry represents a logical text \
element (line, table cell, paragraph, header, footnote, stamp, or handwritten \
note).

Rules:
- box_2d coordinates are [y_min, x_min, y_max, x_max] normalized to 0-1000.
- Never return masks.
- Group text logically — one entry per line, cell, or paragraph.
- Do NOT merge an entire page into one entry.
- For tables, return each cell as a separate entry.
- Include ALL visible text including handwritten content.
- Be precise — the boxes will be used to highlight text in a PDF viewer."""


TENANT_SYSTEM_INSTRUCTION = """\
You are an expert at analyzing Hebrew legal documents. Your task is to extract the "בעלי הזכויות" (rights holders) table from a scanned agreement page.

The document is an agreement (הסכם) with a table. Columns (right-to-left) are:
- חלקת משנה מס' (sub-parcel number)
- שם מלא (full name)
- מס' זהות/ח.פ. (ID or company number)
- חתימה (signature — may contain handwritten signature or be blank)

For each table row (each sub-parcel/tenant):
1. Extract חלקה (parcel, e.g. 590 from the document header), תת_חלקה (sub-parcel number from the row), שם_הדייר (full name from "שם מלא"), and whether the signature cell has a visible handwritten signature (האם_זוהתה_חתימה: true/false).
2. Provide a single bounding box for that row as [x_min, y_min, x_max, y_max] normalized to 0-1 relative to the page (0=left/top, 1=right/bottom). The box should tightly enclose the entire row (all cells for that tenant).

Use code execution (Agentic Vision) to zoom into the table region, inspect each row, and derive precise bounding boxes. You may crop the image to the table, iterate over rows, and use Python to compute or verify coordinates. Return your final answer as a JSON array of objects with keys: "חלקה", "תת_חלקה", "שם_הדייר", "האם_זוהתה_חתימה", "bounding_box" (array of 4 floats)."""


TENANT_USER_PROMPT = """\
Extract every row from the "בעלי הזכויות" table in this document.

Use code execution to:
1. Locate the table on the page.
2. Zoom or crop to the table if needed for precision.
3. For each row, identify חלקה (from document context), תת_חלקה, שם_הדייר (full name), and whether the signature cell has a visible handwritten signature.
4. Compute a bounding box [x_min, y_min, x_max, y_max] normalized 0-1 for each row (covering the full row).

Return ONLY a JSON array of objects, each with: "חלקה", "תת_חלקה", "שם_הדייר", "האם_זוהתה_חתימה", "bounding_box". No other text."""


# -- Pydantic models both as response_schema for Gemini and FastAPI --

class BboxEntry(BaseModel):
    """A single detected text element with its bounding box."""
    box_2d: list[int]
    label: str
    page: int = 1


class BboxRequest(BaseModel):
    gcs_uri: str
    model: Literal["flash", "pro"] = "flash"
    pages: list[int] | None = None
    media_resolution: Literal["low", "medium", "high", "ultra_high"] = "medium"
    use_agentic_vision: bool = False


class BboxResponse(BaseModel):
    model_used: str
    gcs_uri: str
    entries: list[BboxEntry]
    agentic_vision: bool = False
    raw_token_usage: dict | None = None


# -- Tenant table extraction (one row per sub-parcel/tenant, Agentic Vision) --

class TenantEntry(BaseModel):
    """One row in the בעלי הזכויות table with normalized bbox [x_min, y_min, x_max, y_max] 0-1."""
    part: str = Field(alias="חלקה", description="חלקה number (e.g. 590)")
    sub_part: str = Field(alias="תת_חלקה", description="תת חלקה number")
    tenant_name: str = Field(alias="שם_הדייר", description="Full name from שם מלא column")
    signature_detected: bool = Field(alias="האם_זוהתה_חתימה", description="True if signature cell has visible handwriting")
    bounding_box: list[float] = Field(description="[x_min, y_min, x_max, y_max] normalized 0-1")

    model_config = {"populate_by_name": True}


def _ensure_genai_env() -> None:
    use_vertex = os.environ.get(
        "GOOGLE_GENAI_USE_VERTEXAI", ""
    ).strip().lower() in {"1", "true", "yes"}

    if use_vertex or (not settings.gemini_api_key and settings.gcp_project_id):
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"
        if settings.gcp_project_id and not os.environ.get("GOOGLE_CLOUD_PROJECT"):
            os.environ["GOOGLE_CLOUD_PROJECT"] = settings.gcp_project_id
        if settings.vertex_ai_location and not os.environ.get("GOOGLE_CLOUD_LOCATION"):
            os.environ["GOOGLE_CLOUD_LOCATION"] = settings.vertex_ai_location


@router.post("/extract", response_model=BboxResponse)
async def extract_bboxes(
    body: BboxRequest,
    user: CurrentUser = Depends(get_approved_user),
):
    """Send a PDF to Gemini and get back text with bounding boxes.

    Uses the official Vertex AI bounding box detection pattern with
    structured output (response_schema) for reliable typed responses.
    """
    import asyncio

    result = await asyncio.to_thread(_run_bbox_extraction, body)
    return result


def _run_bbox_extraction(body: BboxRequest) -> BboxResponse:
    _ensure_genai_env()

    import json
    from google import genai
    from google.genai import types

    model_id = GEMINI_MODELS[body.model]
    client = genai.Client(
        http_options=types.HttpOptions(api_version="v1"),
    )

    safety = [
        types.SafetySetting(
            category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold=types.HarmBlockThreshold.BLOCK_ONLY_HIGH,
        ),
    ]

    if body.use_agentic_vision:
        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            temperature=0.5,
            safety_settings=safety,
            tools=[types.Tool(code_execution=types.ToolCodeExecution())],
        )
    else:
        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            temperature=0.5,
            safety_settings=safety,
            response_mime_type="application/json",
            response_schema=list[BboxEntry],
        )

    prompt = (
        "Extract every text element from this PDF with bounding boxes. "
        "Label each entry with its text content. "
        "Include the 1-based page number for each entry."
    )

    if body.use_agentic_vision:
        prompt += (
            "\n\nUse code execution to zoom into dense regions, inspect "
            "small text, and verify your bounding boxes are precise. "
            "After investigation, return your final answer as a JSON array "
            "of objects with keys: box_2d, label, page."
        )

    if body.pages:
        prompt += f"\nOnly process pages: {body.pages}. Skip all other pages."

    parts: list[types.Part] = [
        types.Part.from_uri(file_uri=body.gcs_uri, mime_type="application/pdf"),
        types.Part.from_text(text=prompt),
    ]

    logger.info(
        "Bbox extraction: model=%s uri=%s resolution=%s pages=%s agentic=%s",
        model_id,
        body.gcs_uri,
        body.media_resolution,
        body.pages or "all",
        body.use_agentic_vision,
    )

    response = client.models.generate_content(
        model=model_id,
        contents=[types.Content(role="user", parts=parts)],
        config=config,
    )

    entries: list[BboxEntry] = []

    if not body.use_agentic_vision and response.parsed:
        entries = response.parsed
    else:
        raw_text = response.text or ""
        json_match = _extract_json_array(raw_text)
        if json_match:
            try:
                raw = json.loads(json_match)
                entries = [BboxEntry(**e) for e in raw if "box_2d" in e]
            except (json.JSONDecodeError, TypeError, ValueError):
                logger.error("Failed to parse bbox response: %s", raw_text[:500])
                raise HTTPException(
                    status_code=502,
                    detail="Gemini returned invalid bbox data",
                )
        elif raw_text:
            try:
                raw = json.loads(raw_text)
                if isinstance(raw, list):
                    entries = [BboxEntry(**e) for e in raw if "box_2d" in e]
            except (json.JSONDecodeError, TypeError, ValueError):
                logger.error("Failed to parse bbox response: %s", raw_text[:500])
                raise HTTPException(
                    status_code=502,
                    detail="Gemini returned invalid bbox data",
                )

    token_usage = None
    if response.usage_metadata:
        um = response.usage_metadata
        token_usage = {
            "prompt_tokens": getattr(um, "prompt_token_count", None),
            "candidates_tokens": getattr(um, "candidates_token_count", None),
            "total_tokens": getattr(um, "total_token_count", None),
        }

    logger.info(
        "Bbox extraction complete: %d entries, agentic=%s, tokens=%s",
        len(entries),
        body.use_agentic_vision,
        token_usage,
    )

    return BboxResponse(
        model_used=model_id,
        gcs_uri=body.gcs_uri,
        entries=entries,
        agentic_vision=body.use_agentic_vision,
        raw_token_usage=token_usage,
    )


def _extract_json_array(text: str) -> str | None:
    """Pull the first JSON array from mixed text (e.g. agentic vision output
    that interleaves code blocks with prose)."""
    import re
    m = re.search(r"```json\s*(\[[\s\S]*?])\s*```", text)
    if m:
        return m.group(1)
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end > start:
        return text[start : end + 1]
    return None


# -- Ask: answer a question about a document with visual grounding citations --

class AskCitation(BaseModel):
    """A single visually-grounded citation from the document."""
    box_2d: list[int] = Field(description="[y_min, x_min, y_max, x_max] normalized 0-1000")
    label: str = Field(description="Short Hebrew description of what this region shows")
    page: int = Field(default=1, description="1-based PDF page index")


class AskRequest(BaseModel):
    gcs_uri: str
    question: str


class AskResponse(BaseModel):
    answer: str
    citations: list[AskCitation]
    model_used: str
    raw_token_usage: dict | None = None


ASK_SYSTEM_INSTRUCTION = """\
You are a legal document analyst for Israeli real estate due diligence.
You answer questions about documents with VISUAL GROUNDING.

For every claim you make, provide a citation with a bounding box pointing to
the exact region on the PDF page that supports your answer.

Output format — ALWAYS respond with valid JSON:
{
  "answer": "Your full answer in Hebrew (or the language of the question)",
  "citations": [
    {
      "box_2d": [y_min, x_min, y_max, x_max],
      "label": "Short description of what this region contains",
      "page": 1
    }
  ]
}

box_2d rules:
- [y_min, x_min, y_max, x_max], each integer 0-1000 (Pixel-Precise Pointing).
- The box must tightly wrap the relevant text/region.
- One box per citation. Different pages = separate citations.
- NEVER omit citations. Every factual claim must have at least one.

PAGE NUMBER rules (critical for lawyers who will verify your work):
- `page` is the 1-based PDF page index (first page of the PDF = 1).
- Do NOT use the document's printed page number (e.g. "- 33 -" printed on page).
  Use the actual PDF page position instead.
- The box_2d coordinates MUST refer to content on the SAME page you specify.
- If you are unsure which PDF page contains the content, re-examine the document \
carefully. NEVER guess a page number.
- A wrong page number means the lawyer sees unrelated content — this is a critical error.

Answer rules:
- Answer thoroughly based on what you see in the document.
- Use Hebrew for the answer when the document is in Hebrew.
- If you cannot find the answer, say so and cite the most relevant region."""


@router.post("/ask", response_model=AskResponse)
async def ask_document(
    question: str = Form(..., description="User question about the document(s)"),
    files: list[UploadFile] = File(..., description="Up to 5 PDFs or images"),
    user: CurrentUser = Depends(get_approved_user),
):
    """Ask a question about uploaded documents and get an answer with visual grounding citations."""
    import asyncio

    if len(files) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 files allowed")

    file_entries: list[tuple[bytes, str]] = []
    for f in files:
        ct = f.content_type or ""
        if not ct.startswith("image/") and ct != "application/pdf":
            raise HTTPException(status_code=400, detail=f"File must be PDF or image: {f.filename}")
        data = await f.read()
        if not data:
            continue
        file_entries.append((data, ct))

    if not file_entries:
        raise HTTPException(status_code=400, detail="No valid files provided")

    result = await asyncio.to_thread(
        _run_ask, question=question, file_entries=file_entries,
    )
    return result


def _run_ask(*, question: str, file_entries: list[tuple[bytes, str]]) -> AskResponse:
    _ensure_genai_env()

    import json
    from google import genai
    from google.genai import types

    model_id = GEMINI_31_PRO
    client = genai.Client(
        http_options=types.HttpOptions(api_version="v1"),
    )

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

    parts: list[types.Part] = [
        types.Part.from_bytes(data=data, mime_type=mime)
        for data, mime in file_entries
    ]
    parts.append(types.Part.from_text(text=question))

    total_size = sum(len(d) for d, _ in file_entries)
    logger.info("Ask: model=%s files=%d total_size=%d question=%s", model_id, len(file_entries), total_size, question[:100])

    response = client.models.generate_content(
        model=model_id,
        contents=[types.Content(role="user", parts=parts)],
        config=config,
    )

    raw_text = (response.text or "").strip()
    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError:
        json_start = raw_text.find("{")
        json_end = raw_text.rfind("}")
        if json_start != -1 and json_end > json_start:
            try:
                data = json.loads(raw_text[json_start : json_end + 1])
            except json.JSONDecodeError:
                logger.error("Failed to parse ask response: %s", raw_text[:500])
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
                if "box_2d" in item:
                    flat_citations.append(item)
        data = {"answer": "\n".join(answers), "citations": flat_citations}
    if not isinstance(data, dict):
        data = {"answer": str(data), "citations": []}

    citations = []
    for c in data.get("citations", []):
        if not isinstance(c, dict) or "box_2d" not in c:
            continue
        box = c["box_2d"]
        if isinstance(box, list) and len(box) > 0 and isinstance(box[0], list):
            box = box[0]
        if not (isinstance(box, list) and len(box) == 4):
            continue
        try:
            citations.append(AskCitation(
                box_2d=[int(v) for v in box],
                label=c.get("label", ""),
                page=int(c.get("page", 1)),
            ))
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

    logger.info("Ask complete: %d citations, tokens=%s", len(citations), token_usage)

    return AskResponse(
        answer=data.get("answer", "") or raw_text,
        citations=citations,
        model_used=model_id,
        raw_token_usage=token_usage,
    )


@router.get("/files/{project_id}")
async def list_project_files(
    project_id: UUID,
    user: CurrentUser = Depends(get_approved_user),
):
    """List files available for a project (convenience for picking a GCS URI)."""
    from sqlalchemy import select
    from app.db.session import AsyncSessionLocal
    from app.db.models import File

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(File).where(File.project_id == project_id)
        )
        files = result.scalars().all()

    return [
        {
            "id": str(f.id),
            "filename": f.filename,
            "gcs_uri": f.gcs_uri,
        }
        for f in files
    ]


@router.post("/extract-tenants")
async def extract_tenants(
    file: UploadFile = File(..., description="PDF or image (e.g. PNG) of the agreement page with בעלי הזכויות table"),
    user: CurrentUser = Depends(get_approved_user),
):
    """Extract one entry per sub-parcel/tenant from the rights-holders table with bounding boxes.

    Uses Gemini 3 Flash with Agentic Vision (code execution) to zoom and inspect the table
    for accurate bounding boxes.
    """
    import asyncio

    content_type = file.content_type or ""
    if not content_type.startswith("image/") and content_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="File must be PDF or image (e.g. image/png, image/jpeg)",
        )
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    result = await asyncio.to_thread(
        _run_tenant_extraction,
        data=data,
        mime_type=content_type or "application/pdf",
    )
    return result


def _run_tenant_extraction(*, data: bytes, mime_type: str) -> list[dict]:
    _ensure_genai_env()

    import json
    from google import genai
    from google.genai import types

    model_id = GEMINI_31_PRO
    client = genai.Client(
        http_options=types.HttpOptions(api_version="v1"),
    )

    safety = [
        types.SafetySetting(
            category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold=types.HarmBlockThreshold.BLOCK_ONLY_HIGH,
        ),
    ]

    config = types.GenerateContentConfig(
        system_instruction=TENANT_SYSTEM_INSTRUCTION,
        temperature=0.2,
        safety_settings=safety,
        tools=[types.Tool(code_execution=types.ToolCodeExecution())],
    )

    part = types.Part.from_bytes(data=data, mime_type=mime_type)
    parts: list[types.Part] = [part, types.Part.from_text(text=TENANT_USER_PROMPT)]

    logger.info(
        "Tenant extraction: model=%s agentic_vision=true mime=%s size=%d",
        model_id,
        mime_type,
        len(data),
    )

    response = client.models.generate_content(
        model=model_id,
        contents=[types.Content(role="user", parts=parts)],
        config=config,
    )

    raw_text = response.text or ""
    json_match = _extract_json_array(raw_text)
    if not json_match:
        logger.error("No JSON array in tenant response: %s", raw_text[:800])
        raise HTTPException(
            status_code=502,
            detail="Gemini did not return a JSON array (try again or use a clearer image)",
        )
    try:
        raw = json.loads(json_match)
    except json.JSONDecodeError as e:
        logger.error("Invalid JSON from tenant extraction: %s", raw_text[:500])
        raise HTTPException(status_code=502, detail=f"Invalid JSON: {e}") from e

    if not isinstance(raw, list):
        raise HTTPException(status_code=502, detail="Expected a JSON array")

    entries: list[TenantEntry] = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        try:
            entries.append(TenantEntry(**item))
        except Exception as e:
            logger.warning("Skip invalid tenant entry %s: %s", i, e)

    out = [e.model_dump(by_alias=True) for e in entries]
    logger.info("Tenant extraction complete: %d entries", len(out))
    return out
