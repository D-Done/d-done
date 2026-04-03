"""Eval harness: Project Agreement extractor (הסכם פרויקט).

Session state required:
    gcs_uris, document_names, doc_classification

Usage (from backend/):
    adk eval eval/agreement_eval_agent eval/agreement_eval_agent/agreement.test.json \\
        --config_file_path eval/test_config.json
"""

from __future__ import annotations

from google.adk.agents import Agent

from app.agents.constants import EXTRACTOR_DOC_TYPES
from app.agents.extractors.project_agreement.agent import create_agent as _create_agreement
from app.agents.inject_utils import make_inject_pdfs
def _build() -> Agent:
    agent = _create_agreement()
    accepted = EXTRACTOR_DOC_TYPES.get(agent.name, [])
    empty_json = agent.output_schema().model_dump_json()
    agent.before_model_callback = make_inject_pdfs(accepted, empty_json)
    return agent
agent = _build()

