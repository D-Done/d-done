"""Eval harness: Synthesis agent (Senior Underwriter — two-pass).

Unlike the extractor harnesses, synthesis does NOT use ``before_model_callback``
to inject PDFs. Instead, it reads all extractor outputs **directly from session
state** (keys like ``tabu_extraction``, ``zero_report_extraction``, etc.).

This means the eval can be run without re-running any extractors: pre-populate
``session_input.state`` with the captured extractor outputs and the synthesis
agent runs in full isolation.

Session state required:
    document_names      - list of filenames
    tabu_extraction     - dict (output of tabu_extractor)
    zero_report_extraction
    agreement_extraction
    agreement_additions_extraction
    credit_committee_extraction
    company_docs_extraction
    signing_protocol_extraction
    planning_permit_extraction
    pledges_registry_extraction
    other_docs_extraction
    docai_output_uris   - dict (optional, can be {})

The golden ``final_response`` is the ``finance_dd_report`` session state value
after the run (captured by ``capture_golden.py``).

Usage (from backend/):
    adk eval eval/synthesis_eval_agent eval/synthesis_eval_agent/synthesis.test.json \\
        --config_file_path eval/test_config.json
"""

from __future__ import annotations

from google.adk.agents.sequential_agent import SequentialAgent

from app.agents.synthesis.agent import create_agent as _create_synthesis_agents
def _build() -> SequentialAgent:
    main_agent, details_agent = _create_synthesis_agents()
    return SequentialAgent(
        name="synthesis_eval",
        sub_agents=[main_agent, details_agent],
    )
agent = _build()

