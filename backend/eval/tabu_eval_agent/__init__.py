"""Eval harness: Tabu extractor (נסח טאבו).

The harness mirrors what ``create_finance_pipeline`` does for this extractor:
it wires the filtered ``before_model_callback`` so that only files classified
as ``tabu`` are injected into the LLM request.

Session state required (set via ``session_input.state`` in the .test.json):
    gcs_uris        - list of GCS URIs for the test project documents
    document_names  - list of filenames (same order as gcs_uris)
    doc_classification - dict with key "classifications": {filename: doc_type}

Usage (from backend/):
    adk eval eval/tabu_eval_agent eval/tabu_eval_agent/tabu.test.json \\
        --config_file_path eval/test_config.json
"""

from __future__ import annotations

from google.adk.agents import Agent

from app.agents.constants import EXTRACTOR_DOC_TYPES
from app.agents.extractors.tabu.agent import create_agent as _create_tabu
from app.agents.inject_utils import make_inject_pdfs
def _build() -> Agent:
    agent = _create_tabu()
    accepted = EXTRACTOR_DOC_TYPES.get(agent.name, [])
    empty_json = agent.output_schema().model_dump_json()
    agent.before_model_callback = make_inject_pdfs(accepted, empty_json)
    return agent
agent = _build()

