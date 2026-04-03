"""Visual Grounding synthesis agents -- text-only audit pass.

Same two-pass architecture as the standard synthesis (main fields + tenant/findings),
but:
  1. Does NOT receive source PDFs -- grounding was already done by extractors.
  2. Carries forward box_2d values from extractor JSON as-is.
  3. The after_agent_callback converts box_2d -> bounding_boxes (no citation resolver).
  4. Uses Gemini 2.5 Pro (synthesis does not need visual grounding).
  5. Context caching via ADK App (create_vg_app) — audit prompt + schema (~8K tokens)
     cached per run; Gemini context caching ($0.20/1M vs $2/1M) reduces cost on that portion.
"""

from __future__ import annotations

import json
import logging

from google.adk.agents import Agent
from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.readonly_context import ReadonlyContext

from app.agents.constants import (
    STATE_DOCUMENT_NAMES,
    STATE_ENRICHED_REPORT,
)
from app.agents.schemas import SynthesisMainOutput, SynthesisTenantFindingsOutput
from app.agents.synthesis.prompt import get_details_prompt, get_main_prompt
from app.agents.synthesis.schema import RealEstateFinanceDDReport
from app.agents.utils import make_generate_config
from app.agents.visual_grounding_pipeline_agent import (
    GEMINI_31_PRO,
    VG_MAX_OUTPUT_TOKENS,
    _repair_truncated_json,
)
from app.agents.synthesis.agent import EXTRACTOR_OUTPUTS

logger = logging.getLogger(__name__)


_STATE_MAIN = "synthesis_main_output"
_STATE_DETAILS = "synthesis_tenant_findings_output"

_ROLE_HEADER = """\
# Role: Senior Underwriter / Lead Analyst -- Real Estate Finance (Israel)

You are acting as a senior underwriter performing **audit**, not **extraction**. You receive:

1. **Extraction data** -- structured JSON outputs from specialised document-extractor agents \
that already contain visual grounding (box_2d bounding boxes).
2. **Audit logic** -- detailed business rules (Hierarchy of Truth, Name Matching, Red Flags).

Apply the audit rules to the extraction data and produce the output as exact JSON.
"""

CARRY_FORWARD_INSTRUCTION = """\
# VISUAL GROUNDING — carry-forward rules

The extractor agents have already produced `box_2d` bounding boxes for each \
evidentiary reference. You MUST preserve them:

1. When you copy a source reference from extractor data into the report, \
copy its `box_2d`, `page_number`, and `source_document_name` EXACTLY as-is.
2. Do NOT invent new box_2d values — you do not have access to the source PDFs.
3. Do NOT drop or modify existing box_2d values.
4. If an extractor reference has no box_2d (null), leave it as null.
5. `verbatim_quote` is a short label describing the evidence. Copy it as-is \
from the extractor data.
"""


def _json_block(label: str, value: object) -> str:
    if value is None:
        return f"## {label}\n\n```json\nnull\n```"
    try:
        return (
            f"## {label}\n\n```json\n"
            f"{json.dumps(value, ensure_ascii=False, indent=2)}\n```"
        )
    except Exception:
        return f"## {label}\n\n{value!s}"


def _valid_filenames_block(doc_names: list[str]) -> str:
    if not doc_names:
        return ""
    numbered = "\n".join(f"{i + 1}. {name}" for i, name in enumerate(doc_names))
    return (
        "# CRITICAL -- Valid Source Document Names\n\n"
        "The `source_document_name` field in **every** evidentiary reference MUST be "
        "copied **verbatim** from the list below.\n\n"
        f"{numbered}"
    )


def _build_extraction_blocks(ctx: ReadonlyContext) -> str:
    return "\n\n".join(
        _json_block(label, ctx.state.get(key)) for label, key in EXTRACTOR_OUTPUTS
    )


# ---------------------------------------------------------------------------
# Instruction builders
# ---------------------------------------------------------------------------


async def _build_main_instruction(ctx: ReadonlyContext) -> str:
    doc_names: list[str] = ctx.state.get(STATE_DOCUMENT_NAMES) or []
    parts = [_ROLE_HEADER, CARRY_FORWARD_INSTRUCTION, get_main_prompt()]
    filenames_block = _valid_filenames_block(doc_names)
    if filenames_block:
        parts.append(filenames_block)
    parts.append(
        "# Extraction Data (extractor agent outputs)\n\n"
        + _build_extraction_blocks(ctx)
    )
    user_correction = ctx.state.get("_user_correction_prompt")
    if user_correction and isinstance(user_correction, str):
        parts.append(
            "# USER CORRECTION (MANDATORY)\n\n"
            "The user reviewed the previous tenant table output and found errors. "
            "You MUST address the following correction in your re-analysis. "
            "Pay special attention to the tenant_records in agreement_extraction.\n\n"
            f"**User correction:** {user_correction}"
        )
    return "\n\n---\n\n".join(parts)


async def _build_details_instruction(ctx: ReadonlyContext) -> str:
    doc_names: list[str] = ctx.state.get(STATE_DOCUMENT_NAMES) or []
    parts = [_ROLE_HEADER, CARRY_FORWARD_INSTRUCTION, get_details_prompt()]
    filenames_block = _valid_filenames_block(doc_names)
    if filenames_block:
        parts.append(filenames_block)
    parts.append(
        "# Extraction Data (extractor agent outputs)\n\n"
        + _build_extraction_blocks(ctx)
    )
    main_output = ctx.state.get(_STATE_MAIN)
    if main_output:
        parts.append(
            "# Pass 1 Results (already-computed fields)\n\n"
            + _json_block("Synthesis Main Output (Pass 1)", main_output)
        )
    approved = ctx.state.get("_approved_tenant_records")
    if approved is not None and isinstance(approved, list) and len(approved) > 0:
        parts.append(
            "# USER-APPROVED TENANT RECORDS (MANDATORY)\n\n"
            "The user has reviewed and approved the following tenant records. "
            "Use these as ground truth for the `tenant_table` output. "
            "Do NOT override the user's `is_signed` or other decisions; "
            "copy these rows into `tenant_table` and preserve their structure.\n\n"
            + _json_block("Approved tenant records", approved)
        )
    return "\n\n---\n\n".join(parts)


# ---------------------------------------------------------------------------
# box_2d -> bounding_boxes converter
# ---------------------------------------------------------------------------


def _convert_box2d_to_bboxes(report_dict: dict) -> dict:
    """Walk the report dict and convert any box_2d fields on source refs to bounding_boxes.

    box_2d format: [y_min, x_min, y_max, x_max] normalized 0-1000
    bounding_boxes format: [{x0, y0, x1, y1}] normalized 0-1
    """

    def _convert_source(src: dict) -> dict:
        box_2d = src.pop("box_2d", None)
        if box_2d and isinstance(box_2d, list) and len(box_2d) == 4:
            y_min, x_min, y_max, x_max = box_2d
            src["bounding_boxes"] = [
                {
                    "x0": x_min / 1000.0,
                    "y0": y_min / 1000.0,
                    "x1": x_max / 1000.0,
                    "y1": y_max / 1000.0,
                }
            ]
        return src

    def _walk(obj):
        if isinstance(obj, dict):
            if "verbatim_quote" in obj and "source_document_name" in obj:
                _convert_source(obj)
            for v in obj.values():
                _walk(v)
        elif isinstance(obj, list):
            for item in obj:
                _walk(item)

    _walk(report_dict)
    return report_dict


# ---------------------------------------------------------------------------
# After-agent callback: merge + convert bboxes (no citation resolver)
# ---------------------------------------------------------------------------


async def _merge_and_convert(callback_context: CallbackContext) -> None:
    """Merge two-pass outputs and convert box_2d to bounding_boxes."""
    main_data: dict = callback_context.state.get(_STATE_MAIN) or {}
    details_data: dict = callback_context.state.get(_STATE_DETAILS) or {}

    merged = {**main_data, **details_data}

    try:
        report = RealEstateFinanceDDReport.model_validate(merged)
        report_dict = report.model_dump(mode="json")
    except Exception as exc:
        logger.warning(
            "Report merge/validation failed (%s) -- storing raw merged dict.", exc
        )
        report_dict = merged

    report_dict = _convert_box2d_to_bboxes(report_dict)
    report_dict["_visual_grounding"] = True

    callback_context.state["finance_dd_report"] = report_dict
    callback_context.state[STATE_ENRICHED_REPORT] = report_dict
    return None


# ---------------------------------------------------------------------------
# Agent builder
# ---------------------------------------------------------------------------


def _make_agent(
    *,
    name: str,
    instruction,
    output_schema,
    output_key: str,
    after_agent_callback=None,
) -> Agent:
    generate_content_config = make_generate_config(
        max_output_tokens=VG_MAX_OUTPUT_TOKENS
    )
    kwargs: dict = dict(
        name=name,
        model=GEMINI_31_PRO,
        instruction=instruction,
        description=(
            "Senior underwriter -- audits extraction data (which already contains "
            "box_2d grounding from extractors) and produces the DD report. "
            "Does NOT receive source PDFs; carries forward extractor groundings."
        ),
        output_schema=output_schema,
        output_key=output_key,
        after_model_callback=_repair_truncated_json,
    )
    if after_agent_callback is not None:
        kwargs["after_agent_callback"] = after_agent_callback
    if generate_content_config is not None:
        kwargs["generate_content_config"] = generate_content_config
    return Agent(**kwargs)


# ---------------------------------------------------------------------------
# Public factory
# ---------------------------------------------------------------------------


def create_vg_synthesis_agents() -> list[Agent]:
    """Return [main_agent, details_agent] for the visual grounding pipeline."""
    return [
        _make_agent(
            name="vg_senior_underwriter_main",
            instruction=_build_main_instruction,
            output_schema=SynthesisMainOutput,
            output_key=_STATE_MAIN,
        ),
        _make_agent(
            name="vg_senior_underwriter_details",
            instruction=_build_details_instruction,
            output_schema=SynthesisTenantFindingsOutput,
            output_key=_STATE_DETAILS,
            after_agent_callback=_merge_and_convert,
        ),
    ]
