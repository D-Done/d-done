"""Senior Underwriter / Finance Synthesis — two-pass split architecture.

Business logic lives in ``prompt.py``.  Instruction is built dynamically
from extractor outputs in session state.

  Pass 1 (finance_senior_underwriter_main):
      All scalar / small-object fields.

  Pass 2 (finance_senior_underwriter_details):
      tenant_table + findings.
      Receives raw extractor outputs AND Pass 1 results as context,
      so findings can cross-reference computed fields
      (signing_percentage, financing, developer_signature,
       contractual_milestones, etc.).

After Pass 2, an after_agent_callback merges both outputs into the final
RealEstateFinanceDDReport and runs deterministic citation enrichment.
"""

from __future__ import annotations

import asyncio
import json
import logging

from google.adk.agents import Agent
from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.readonly_context import ReadonlyContext
from google.genai import types as genai_types

from app.agents.utils import make_generate_config
from app.agents.constants import (
    STATE_DOCUMENT_NAMES,
    STATE_ENRICHED_REPORT,
)
from app.agents.schemas import SynthesisMainOutput, SynthesisTenantFindingsOutput
from app.agents.synthesis.prompt import get_details_prompt, get_main_prompt
from app.agents.synthesis.schema import RealEstateFinanceDDReport
from app.core.config import settings

logger = logging.getLogger(__name__)

MODEL = settings.gemini_pro_model

# Session-state keys for the two intermediate outputs
_STATE_MAIN = "synthesis_main_output"
_STATE_DETAILS = "synthesis_tenant_findings_output"

_ROLE_HEADER = """\
# Role: Senior Underwriter / Lead Analyst — Real Estate Finance (Israel)

You are acting as a senior underwriter performing **audit**, not **extraction**. You receive:

1. **Extraction data** — structured JSON outputs from specialised document-extractor agents.
2. **Audit logic** — detailed business rules (Hierarchy of Truth, Name Matching, Red Flags).

Apply the audit rules to the extraction data and produce the output as exact JSON — **no additional text**.
"""

EXTRACTOR_OUTPUTS: list[tuple[str, str]] = [
    ("Tabu Extraction (נסח טאבו)", "tabu_extraction"),
    ('Zero Report Extraction (דו"ח אפס)', "zero_report_extraction"),
    ("Agreement Extraction (הסכם פרויקט)", "agreement_extraction"),
    ("Agreement Additions Extraction (תוספות להסכם)", "agreement_additions_extraction"),
    ("Credit Committee Extraction (ועדת אשראי)", "credit_committee_extraction"),
    ("Appendix A Extraction (נספח א')", "appendix_a_extraction"),
    ("Company Documents Extraction (מסמכי חברה)", "company_docs_extraction"),
    (
        "Signing Protocol Extraction (פרוטוקול מורשה חתימה)",
        "signing_protocol_extraction",
    ),
    ("Planning Permit Extraction (החלטת ועדה / היתר)", "planning_permit_extraction"),
    ("Pledges Registry Extraction (רשם המשכונות)", "pledges_registry_extraction"),
    ("Other Documents Extraction (מסמכים נוספים)", "other_docs_extraction"),
]


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


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
        "# CRITICAL — Valid Source Document Names\n\n"
        "The `source_document_name` field in **every** evidentiary reference MUST be "
        "copied **verbatim** from the list below. "
        "Do NOT invent, shorten, translate, or paraphrase a filename. "
        "If you cannot identify which document a fact comes from, "
        "use the most plausible name from this list — never a name outside it.\n\n"
        f"{numbered}"
    )


def _build_extraction_blocks(ctx: ReadonlyContext) -> str:
    return "\n\n".join(
        _json_block(label, ctx.state.get(key)) for label, key in EXTRACTOR_OUTPUTS
    )


# ---------------------------------------------------------------------------
# Pass 1 instruction builder
# ---------------------------------------------------------------------------


async def _build_main_instruction(ctx: ReadonlyContext) -> str:
    doc_names: list[str] = ctx.state.get(STATE_DOCUMENT_NAMES) or []
    parts = [_ROLE_HEADER, get_main_prompt()]
    filenames_block = _valid_filenames_block(doc_names)
    if filenames_block:
        parts.append(filenames_block)
    parts.append(
        "# Extraction Data (extractor agent outputs)\n\n"
        + _build_extraction_blocks(ctx)
    )
    return "\n\n---\n\n".join(parts)


# ---------------------------------------------------------------------------
# Pass 2 instruction builder
# Pass 1 output is injected so findings can cross-reference computed fields.
# ---------------------------------------------------------------------------


async def _build_details_instruction(ctx: ReadonlyContext) -> str:
    doc_names: list[str] = ctx.state.get(STATE_DOCUMENT_NAMES) or []
    parts = [_ROLE_HEADER, get_details_prompt()]
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
            "# Pass 1 Results (already-computed fields — use for cross-referencing findings)\n\n"
            + _json_block("Synthesis Main Output (Pass 1)", main_output)
        )
    return "\n\n---\n\n".join(parts)


# ---------------------------------------------------------------------------
# After-agent callback on Pass 2: merge → validate → enrich citations
# ---------------------------------------------------------------------------


async def _merge_and_resolve(callback_context: CallbackContext) -> None:
    """Merge the two partial outputs into RealEstateFinanceDDReport and enrich citations."""
    main_data: dict = callback_context.state.get(_STATE_MAIN) or {}
    details_data: dict = callback_context.state.get(_STATE_DETAILS) or {}

    merged = {**main_data, **details_data}

    try:
        report = RealEstateFinanceDDReport.model_validate(merged)
        report_dict = report.model_dump(mode="json")
    except Exception as exc:
        logger.warning(
            "Report merge/validation failed (%s) — storing raw merged dict.", exc
        )
        report_dict = merged

    callback_context.state["finance_dd_report"] = report_dict
    callback_context.state[STATE_ENRICHED_REPORT] = report_dict
    return None


# ---------------------------------------------------------------------------
# Generate config: no thinking, no max_output_tokens cap
# ---------------------------------------------------------------------------


def _make_generate_config() -> genai_types.GenerateContentConfig | None:
    return make_generate_config()


# ---------------------------------------------------------------------------
# Internal agent builder
# ---------------------------------------------------------------------------


def _make_agent(
    *,
    name: str,
    instruction,
    output_schema,
    output_key: str,
    after_agent_callback=None,
) -> Agent:
    generate_content_config = _make_generate_config()
    kwargs: dict = dict(
        name=name,
        model=MODEL,
        instruction=instruction,
        description="Senior underwriter — audits extraction data and produces a comprehensive real-estate finance DD report.",
        output_schema=output_schema,
        output_key=output_key,
    )
    if after_agent_callback is not None:
        kwargs["after_agent_callback"] = after_agent_callback
    if generate_content_config is not None:
        kwargs["generate_content_config"] = generate_content_config
    return Agent(**kwargs)


# ---------------------------------------------------------------------------
# Public agent factories
# ---------------------------------------------------------------------------


def create_main_agent() -> Agent:
    """Pass 1: generate all scalar/small fields (excludes tenant_table and findings)."""
    return _make_agent(
        name="finance_senior_underwriter_main",
        instruction=_build_main_instruction,
        output_schema=SynthesisMainOutput,
        output_key=_STATE_MAIN,
    )


def create_details_agent() -> Agent:
    """Pass 2: generate tenant_table + findings, with Pass 1 output as context.
    After completion: merges both passes and runs citation enrichment."""
    return _make_agent(
        name="finance_senior_underwriter_details",
        instruction=_build_details_instruction,
        output_schema=SynthesisTenantFindingsOutput,
        output_key=_STATE_DETAILS,
        after_agent_callback=_merge_and_resolve,
    )


def create_agent(*, correction_context: str | None = None) -> list[Agent]:
    """Return [main_agent, details_agent] to wire into a SequentialAgent.

    The two agents are designed to run sequentially:
      main_agent writes _STATE_MAIN to session state,
      details_agent reads it for cross-referencing and writes _STATE_DETAILS,
      details_agent's after_agent_callback merges both into finance_dd_report.
    """
    if not correction_context:
        return [create_main_agent(), create_details_agent()]

    async def _main_with_correction(ctx: ReadonlyContext) -> str:
        return (await _build_main_instruction(ctx)) + f"\n\n{correction_context}"

    async def _details_with_correction(ctx: ReadonlyContext) -> str:
        return (await _build_details_instruction(ctx)) + f"\n\n{correction_context}"

    return [
        _make_agent(
            name="finance_senior_underwriter_main",
            instruction=_main_with_correction,
            output_schema=SynthesisMainOutput,
            output_key=_STATE_MAIN,
        ),
        _make_agent(
            name="finance_senior_underwriter_details",
            instruction=_details_with_correction,
            output_schema=SynthesisTenantFindingsOutput,
            output_key=_STATE_DETAILS,
            after_agent_callback=_merge_and_resolve,
        ),
    ]
