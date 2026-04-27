"""Chapter-agent factory for M&A v1.

Each of the 10 mandatory chapters runs as a Gemini 3.1 Pro agent producing
``ChapterOutput``. The factory returns a list of ADK Agents configured with:

- model = gemini-3.1-pro-preview (native PDF + box_2d)
- output_schema = ChapterOutput (unified shape)
- output_key = chapter_state_key(chapter_id)
- before_model_callback = injects only the PDFs tagged for this chapter
- after_model_callback = repairs truncated JSON (shared helper)

When more than ``_VG_BATCH_SIZE`` PDFs are tagged to a chapter the callback
uses a two-tier strategy so every document is analysed:

  Tier 1 — visual grounding batch (≤ ``_VG_BATCH_SIZE`` PDFs):
      Injected as ``Part.from_uri`` GCS references → full box_2d citations.
      Sorted by file size ascending so compact, focused documents (IDs,
      certificates, short reports) get native visual grounding first.

  Tier 2 — overflow batches (remaining PDFs, ``_OVERFLOW_BATCH_SIZE`` each):
      Each batch is sent to Gemini Flash in parallel with a lightweight
      extraction prompt.  The returned text is injected as ``Part.from_text``
      into the same Pro call that handles Tier 1.  No documents are dropped.
"""

from __future__ import annotations

import asyncio
import json
import logging

from google.adk.agents import Agent
from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from app.agents.constants import (
    FLASH_MODEL,
    STATE_CONTENT_TYPES,
    STATE_DOCUMENT_NAMES,
    STATE_FILE_SIZES,
    STATE_GCS_URIS,
    STATE_TEXT_PARTS,
)
from app.agents.ma.chapter_prompts import build_chapter_prompt
from app.agents.ma.constants import (
    CHAPTER_CHANNEL_RESELLER_PARTNER,
    CHAPTER_CORPORATE_GOVERNANCE,
    CHAPTER_CUSTOMER_OBLIGATIONS,
    CHAPTER_FINANCIAL_DEBT,
    CHAPTER_HR,
    CHAPTER_INSURANCE,
    CHAPTER_IP_LICENSING,
    CHAPTER_IP_OWNERSHIP,
    CHAPTER_LITIGATION,
    CHAPTER_OSS,
    CHAPTER_REGULATORY,
    CHAPTER_SUPPLIER_OBLIGATIONS,
    CHAPTER_TAXATION,
    CHAPTER_TECHNOLOGY_PRODUCT,
    CHAPTER_TRANSACTION_OVERVIEW,
    CHAPTER_TITLES_HE,
    MA_MANDATORY_CHAPTERS,
    STATE_MA_CLASSIFICATION,
    chapter_state_key,
)
from app.agents.ma.report_schema import (
    ChapterOutput,
    ChannelResellerPartnerChapterOutput,
    CorporateGovernanceChapterOutput,
    CustomerObligationsChapterOutput,
    FinancialDebtChapterOutput,
    HrChapterOutput,
    InsuranceChapterOutput,
    IpLicensingChapterOutput,
    IpOwnershipChapterOutput,
    LitigationChapterOutput,
    OssChapterOutput,
    RegulatoryChapterOutput,
    SupplierObligationsChapterOutput,
    TaxationChapterOutput,
    TechnologyProductChapterOutput,
    TransactionOverviewChapterOutput,
)
from app.agents.utils import make_generate_config
from app.agents.visual_grounding_pipeline_agent import (
    GEMINI_31_PRO,
    VG_INSTRUCTION,
    VG_MAX_OUTPUT_TOKENS,
    _build_manifest,
    _repair_truncated_json,
)

logger = logging.getLogger(__name__)

# PDFs injected as GCS URIs (native visual-grounding / box_2d support).
_VG_BATCH_SIZE = 15
# PDFs per overflow Flash-extraction call. Each call fits well within the
# Flash 1 M-token limit (≤ 15 PDFs × ~50 k tokens/PDF = ~750 k tokens).
_OVERFLOW_BATCH_SIZE = 15
# Gemini hard limit for PDF files passed as GCS URIs (50 MiB).
# Files exceeding this are routed to the overflow text-extraction path instead.
_GCS_PDF_MAX_BYTES = 50 * 1024 * 1024  # 50 MiB
# MIME types accepted as GCS URIs by the Gemini multimodal API.
_VG_SUPPORTED_MIME_TYPES: frozenset[str] = frozenset(
    {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
    }
)
# Character cap on the text returned by each overflow extraction call.
# ~30 k chars ≈ 7 500 tokens per batch; keeps 10 overflow batches within
# ~75 k tokens of the Pro call's context budget.
_MAX_EXTRACTION_CHARS = 30_000
# Character cap per text-only file (Excel, Word, etc.).
_MAX_CHARS_PER_FILE = 10_000


# Schemas whose inlined JSON size exceeds Vertex AI's response_schema limit
# (~35 KB after $ref expansion) fall back to the plain ChapterOutput.
# Anchor extraction for those chapters is intentionally skipped for now.
_CHAPTER_OUTPUT_SCHEMAS: dict[str, type[ChapterOutput]] = {
    CHAPTER_TRANSACTION_OVERVIEW: ChapterOutput,          # 57 KB inlined — too large
    CHAPTER_CORPORATE_GOVERNANCE: CorporateGovernanceChapterOutput,  # 34 KB — OK
    CHAPTER_CUSTOMER_OBLIGATIONS: ChapterOutput,          # 58 KB inlined — too large
    CHAPTER_SUPPLIER_OBLIGATIONS: ChapterOutput,          # 53 KB inlined — too large
    CHAPTER_CHANNEL_RESELLER_PARTNER: ChapterOutput,      # 51 KB inlined — too large
    CHAPTER_HR: HrChapterOutput,                          # ~14 KB after fix — OK
    CHAPTER_REGULATORY: RegulatoryChapterOutput,          # 14 KB — OK
    CHAPTER_LITIGATION: LitigationChapterOutput,          # 14 KB — OK
    CHAPTER_TAXATION: TaxationChapterOutput,              # 12 KB — OK
    CHAPTER_FINANCIAL_DEBT: FinancialDebtChapterOutput,   # 15 KB — OK
    CHAPTER_INSURANCE: InsuranceChapterOutput,            # 12 KB — OK
    CHAPTER_TECHNOLOGY_PRODUCT: TechnologyProductChapterOutput,  # 32 KB — OK
    CHAPTER_IP_OWNERSHIP: IpOwnershipChapterOutput,       # 32 KB — OK
    CHAPTER_IP_LICENSING: ChapterOutput,                  # 43 KB inlined — too large
    CHAPTER_OSS: OssChapterOutput,                        # 29 KB — OK
}


def _empty_chapter_json(chapter_id: str) -> str:
    """Serialized default ``ChapterOutput`` for the no-docs-tagged fallback."""
    return ChapterOutput(
        chapter_id=chapter_id,
        chapter_title_he=CHAPTER_TITLES_HE[chapter_id],
        summary_he="לא נמצאו מסמכים רלוונטיים לפרק זה.",
        empty_state=True,
    ).model_dump_json()


async def _extract_overflow_batch(
    batch: list[tuple[str, str, str]],
    chapter_id: str,
    batch_index: int,
) -> str:
    """Call Gemini Flash to extract relevant text from one overflow PDF batch.

    Returns the extracted text capped at ``_MAX_EXTRACTION_CHARS`` characters.
    On failure returns a short error placeholder so the chapter can continue.
    """
    from google.genai import Client

    chapter_title = CHAPTER_TITLES_HE.get(chapter_id, chapter_id)
    names_str = ", ".join(name for _, name, _ in batch)

    parts: list[types.Part] = [
        types.Part.from_uri(file_uri=uri, mime_type=mime)
        for uri, _, mime in batch
    ]
    parts.append(
        types.Part.from_text(
            text=(
                f"You are reviewing M&A due-diligence documents for the chapter: '{chapter_title}'.\n"
                f"Documents in this batch: {names_str}\n\n"
                "Extract ALL relevant information from these documents: facts, dates, monetary amounts, "
                "party names, key clauses, obligations, conditions, risks, and red flags. "
                "Organise your output by document name. Be thorough and preserve important details verbatim. "
                "This extracted text will feed a senior analyst writing the final chapter."
            )
        )
    )

    try:
        client = Client()
        response = await client.aio.models.generate_content(
            model=FLASH_MODEL,
            contents=parts,
        )
        text = (response.text or "").strip()
        if len(text) > _MAX_EXTRACTION_CHARS:
            text = text[:_MAX_EXTRACTION_CHARS] + "\n... [extraction truncated]"
        logger.info(
            "ma_chapter[%s]: overflow batch %d extracted %d chars from %d PDF(s)",
            chapter_id,
            batch_index,
            len(text),
            len(batch),
        )
        return text
    except Exception as exc:
        logger.warning(
            "ma_chapter[%s]: overflow batch %d extraction failed: %s",
            chapter_id,
            batch_index,
            exc,
        )
        return f"[Overflow batch {batch_index + 1} extraction failed: {exc}]"


def _make_inject_pdfs_by_chapter(chapter_id: str, empty_json: str):
    """Return an async ``before_model_callback`` that filters PDFs by chapter tag.

    Reads ``STATE_MA_CLASSIFICATION`` written by the M&A classifier and picks
    only documents whose ``chapter_tags`` include this chapter.  When nothing
    matches, short-circuits with an empty_state ChapterOutput.

    For chapters with many tagged PDFs the two-tier strategy is applied:
    the first ``_VG_BATCH_SIZE`` PDFs (smallest first) go in as GCS URIs for
    visual grounding; the rest are extracted in parallel by Flash and injected
    as text — so every document is analysed.
    """

    async def _callback(
        callback_context: CallbackContext, llm_request: LlmRequest
    ) -> LlmResponse | None:
        classification: dict = (
            callback_context.state.get(STATE_MA_CLASSIFICATION) or {}
        )
        documents = classification.get("documents") or []
        tagged_names: set[str] = {
            doc.get("filename")
            for doc in documents
            if chapter_id in (doc.get("chapter_tags") or [])
            and doc.get("filename")
        }

        all_uris: list[str] = callback_context.state.get(STATE_GCS_URIS, [])
        all_names: list[str] = callback_context.state.get(STATE_DOCUMENT_NAMES, [])
        all_types: list[str] = callback_context.state.get(STATE_CONTENT_TYPES, [])
        all_sizes: list[int] = callback_context.state.get(STATE_FILE_SIZES, [])
        text_parts: dict[str, str] = callback_context.state.get(STATE_TEXT_PARTS, {})

        matched_with_size: list[tuple[str, str, str, int]] = [
            (
                uri,
                name,
                all_types[i] if i < len(all_types) else "application/pdf",
                all_sizes[i] if i < len(all_sizes) else 0,
            )
            for i, (uri, name) in enumerate(zip(all_uris, all_names))
            if name in tagged_names
        ]

        matched_text = {
            fname: text
            for fname, text in text_parts.items()
            if fname in tagged_names
        }

        if not matched_with_size and not matched_text:
            logger.info(
                "ma_chapter[%s]: no documents tagged, short-circuiting to empty_state",
                chapter_id,
            )
            return LlmResponse(
                content=types.Content(
                    role="model",
                    parts=[types.Part.from_text(text=empty_json)],
                )
            )

        # Sort by file size ascending — smaller files are typically more focused
        # (IDs, certificates, short extracts) and get visual grounding first.
        matched_with_size.sort(key=lambda x: x[3])

        # Partition: VG batch only takes files that are:
        #   (a) a MIME type the Gemini multimodal API accepts as a GCS URI, AND
        #   (b) within the 50 MiB per-file limit enforced by the API.
        # Oversized or unsupported files go directly to overflow (text extraction).
        vg_eligible = [
            item
            for item in matched_with_size
            if item[2] in _VG_SUPPORTED_MIME_TYPES and item[3] <= _GCS_PDF_MAX_BYTES
        ]
        vg_ineligible = [
            item
            for item in matched_with_size
            if item[2] not in _VG_SUPPORTED_MIME_TYPES or item[3] > _GCS_PDF_MAX_BYTES
        ]
        if vg_ineligible:
            logger.info(
                "ma_chapter[%s]: %d file(s) skipped for VG (unsupported MIME or >50 MiB) → overflow",
                chapter_id,
                len(vg_ineligible),
            )

        vg_batch = vg_eligible[:_VG_BATCH_SIZE]
        overflow = vg_eligible[_VG_BATCH_SIZE:] + vg_ineligible

        logger.info(
            "ma_chapter[%s]: %d PDF(s) tagged — %d in VG batch, %d in overflow",
            chapter_id,
            len(matched_with_size),
            len(vg_batch),
            len(overflow),
        )

        # Tier 1: GCS URI parts for the VG batch (visual grounding preserved).
        parts: list[types.Part] = [
            types.Part.from_uri(file_uri=uri, mime_type=mime)
            for uri, _, mime, _ in vg_batch
        ]

        # Tier 2: parallel Flash extraction for all overflow batches.
        if overflow:
            overflow_triples = [(uri, name, mime) for uri, name, mime, _ in overflow]
            batches = [
                overflow_triples[i : i + _OVERFLOW_BATCH_SIZE]
                for i in range(0, len(overflow_triples), _OVERFLOW_BATCH_SIZE)
            ]
            logger.info(
                "ma_chapter[%s]: extracting %d overflow batch(es) via Flash in parallel",
                chapter_id,
                len(batches),
            )
            extractions: list[str | BaseException] = await asyncio.gather(
                *[
                    _extract_overflow_batch(batch, chapter_id, idx)
                    for idx, batch in enumerate(batches)
                ],
                return_exceptions=True,
            )
            for idx, result in enumerate(extractions):
                if isinstance(result, BaseException):
                    text = f"[Overflow batch {idx + 1} extraction raised: {result}]"
                else:
                    text = result
                overflow_names = [name for _, name, _ in batches[idx]]
                parts.append(
                    types.Part.from_text(
                        text=(
                            f"[Extracted content — overflow batch {idx + 1} "
                            f"({len(overflow_names)} PDF(s): {', '.join(overflow_names)})]\n"
                            f"{text}"
                        )
                    )
                )

        # Text-only files (Excel, Word, etc.) tagged to this chapter.
        for fname, text in matched_text.items():
            body = text[:_MAX_CHARS_PER_FILE]
            suffix = "\n... [truncated]" if len(text) > _MAX_CHARS_PER_FILE else ""
            parts.append(
                types.Part.from_text(text=f"[Document: {fname}]\n{body}{suffix}")
            )

        parts.append(types.Part.from_text(text=_build_manifest(all_names)))
        parts.append(types.Part.from_text(text=VG_INSTRUCTION))
        llm_request.contents.insert(0, types.Content(role="user", parts=parts))
        logger.info(
            "ma_chapter[%s]: injected %d VG PDF(s), %d overflow PDF(s), %d text doc(s)",
            chapter_id,
            len(vg_batch),
            len(overflow),
            len(matched_text),
        )
        return None

    return _callback


def _create_chapter_agent(chapter_id: str) -> Agent:
    """Build a single chapter agent."""
    instruction = build_chapter_prompt(chapter_id)
    empty_json = _empty_chapter_json(chapter_id)
    agent = Agent(
        name=f"ma_chapter_{chapter_id}",
        model=GEMINI_31_PRO,
        instruction=instruction,
        description=(
            f"M&A chapter agent for {CHAPTER_TITLES_HE[chapter_id]}. "
            f"Reads PDFs tagged for '{chapter_id}' (VG batch as GCS URIs + "
            f"overflow batches as Flash-extracted text) and produces ChapterOutput."
        ),
        output_schema=_CHAPTER_OUTPUT_SCHEMAS.get(chapter_id, ChapterOutput),
        output_key=chapter_state_key(chapter_id),
        generate_content_config=make_generate_config(
            max_output_tokens=VG_MAX_OUTPUT_TOKENS
        ),
        after_model_callback=_repair_truncated_json,
    )
    agent.before_model_callback = _make_inject_pdfs_by_chapter(chapter_id, empty_json)
    return agent


def create_ma_chapter_agents() -> list[Agent]:
    """Return one agent per chapter in ``MA_MANDATORY_CHAPTERS``."""
    return [_create_chapter_agent(cid) for cid in MA_MANDATORY_CHAPTERS]


__all__ = ["create_ma_chapter_agents"]
