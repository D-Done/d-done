#!/usr/bin/env python3
"""Capture golden datasets for the eval harnesses.

Run this script once against a known-good set of test documents to generate
the ``.test.json`` golden files that ``adk eval`` / pytest will use for
regression testing.

Prerequisites
-------------
1. Upload test PDFs to GCS::

       gsutil -m cp *.pdf gs://d-done-eval/test_docs/<project_name>/

2. Set environment variables::

       export EVAL_GCS_BUCKET=d-done-eval
       export EVAL_PROJECT_NAME=<project_name>
       export GOOGLE_CLOUD_PROJECT=<your-gcp-project>
       # ADC credentials already configured (gcloud auth application-default login)

3. Run from the backend directory::

       cd backend
       python eval/capture_golden.py

The script:
  - Lists all PDFs in ``gs://{EVAL_GCS_BUCKET}/test_docs/{EVAL_PROJECT_NAME}/``
  - Runs the document classifier to build ``doc_classification``
  - Runs the four priority extractors (tabu, agreement, company_docs, zero_report)
  - Runs the synthesis agent with the captured extractor outputs
  - Writes one ``.test.json`` per harness in the corresponding directory

Review the generated JSON files before committing them as golden datasets.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path
from uuid import uuid4

# ---------------------------------------------------------------------------
# Bootstrap: make sure ``app.*`` imports work when invoked as a script
# ---------------------------------------------------------------------------

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
logger = logging.getLogger("capture_golden")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

from eval.config import (  # noqa: E402  (after sys.path patch)
    ADK_APP_NAME,
    ADK_EVAL_USER_ID,
    EVAL_GCS_BUCKET,
    EVAL_PROJECT_NAME,
)

EVAL_DIR = Path(__file__).resolve().parent


# ---------------------------------------------------------------------------
# Helpers — GCS
# ---------------------------------------------------------------------------


def list_gcs_pdfs(bucket: str, prefix: str) -> list[str]:
    """Return a list of ``gs://…`` URIs for every PDF under ``prefix``."""
    from google.cloud import storage  # type: ignore

    client = storage.Client()
    blobs = client.list_blobs(bucket, prefix=prefix)
    uris = []
    for blob in blobs:
        if blob.name.lower().endswith(".pdf"):
            uris.append(f"gs://{bucket}/{blob.name}")
    if not uris:
        raise RuntimeError(
            f"No PDF files found at gs://{bucket}/{prefix}. "
            "Did you upload the test documents?"
        )
    logger.info("Found %d PDF(s) in gs://%s/%s", len(uris), bucket, prefix)
    return sorted(uris)


# ---------------------------------------------------------------------------
# Helpers — ADK Runner
# ---------------------------------------------------------------------------


async def _run_agent(agent, initial_state: dict) -> dict:
    """Run *agent* with *initial_state* and return the final session state."""
    from google.adk.artifacts import InMemoryArtifactService
    from google.adk.memory import InMemoryMemoryService
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types

    session_service = InMemorySessionService()
    session_id = str(uuid4())
    await session_service.create_session(
        app_name=ADK_APP_NAME,
        user_id=ADK_EVAL_USER_ID,
        session_id=session_id,
        state=initial_state,
    )

    runner = Runner(
        agent=agent,
        app_name=ADK_APP_NAME,
        session_service=session_service,
        artifact_service=InMemoryArtifactService(),
        memory_service=InMemoryMemoryService(),
        auto_create_session=False,
    )

    trigger = types.Content(
        role="user",
        parts=[types.Part.from_text(text="Process documents.")],
    )

    async for _ in runner.run_async(
        user_id=ADK_EVAL_USER_ID,
        session_id=session_id,
        new_message=trigger,
    ):
        pass

    session = await session_service.get_session(
        app_name=ADK_APP_NAME,
        user_id=ADK_EVAL_USER_ID,
        session_id=session_id,
    )
    return dict(session.state or {})


# ---------------------------------------------------------------------------
# Helpers — EvalSet JSON writer
# ---------------------------------------------------------------------------


def _make_eval_set(
    eval_set_id: str,
    description: str,
    eval_id: str,
    session_state: dict,
    golden_response: str,
) -> "EvalSet":
    """Build a proper ADK EvalSet using ADK's own Pydantic models.

    Using ADK models (rather than hand-written dicts) guarantees that
    ``EvalSet.model_validate_json`` on the runner side succeeds without
    falling back to the legacy parser, which returns ``conversation=None``
    and causes ``TypeError: object of type 'NoneType' has no len()``.
    """
    from google.adk.evaluation.eval_case import EvalCase, Invocation, SessionInput
    from google.adk.evaluation.eval_set import EvalSet
    from google.genai import types as genai_types

    invocation = Invocation(
        invocation_id=str(uuid4()),
        user_content=genai_types.Content(
            role="user",
            parts=[genai_types.Part(text="Process documents.")],
        ),
        final_response=genai_types.Content(
            role="model",
            parts=[genai_types.Part(text=golden_response)],
        ),
        creation_timestamp=time.time(),
    )

    eval_case = EvalCase(
        eval_id=eval_id,
        conversation=[invocation],
        session_input=SessionInput(
            app_name=ADK_APP_NAME,
            user_id=ADK_EVAL_USER_ID,
            state=session_state,
        ),
        creation_timestamp=time.time(),
    )

    return EvalSet(
        eval_set_id=eval_set_id,
        name=eval_set_id.replace("_", " ").title(),
        description=description,
        eval_cases=[eval_case],
        creation_timestamp=time.time(),
    )


def _write_test_json(path: Path, eval_set: "EvalSet") -> None:
    path.write_text(eval_set.model_dump_json(indent=2))
    logger.info("Wrote golden dataset → %s", path)


# ---------------------------------------------------------------------------
# Stage 1 — Classify
# ---------------------------------------------------------------------------


async def run_classifier(gcs_uris: list[str], doc_names: list[str]) -> dict:
    """Run the document classifier and return the ``doc_classification`` dict."""
    from app.agents.doc_classifier_agent import create_classifier_agent
    from app.agents.constants import STATE_DOC_CLASSIFICATION, STATE_DOCUMENT_NAMES, STATE_GCS_URIS
    from app.agents.inject_utils import inject_pdfs

    classifier = create_classifier_agent()
    classifier.before_model_callback = inject_pdfs

    state = await _run_agent(
        classifier,
        {
            STATE_GCS_URIS: gcs_uris,
            STATE_DOCUMENT_NAMES: doc_names,
        },
    )

    classification = state.get(STATE_DOC_CLASSIFICATION)
    if not classification:
        raise RuntimeError("Classifier produced no output.")

    logger.info("Classification result: %s", classification)
    return classification


# ---------------------------------------------------------------------------
# Stage 2 — Run a single extractor
# ---------------------------------------------------------------------------

EXTRACTOR_CONFIGS: list[dict] = [
    {
        "name": "tabu",
        "harness_dir": "tabu_eval_agent",
        "test_file": "tabu.test.json",
        "state_key": "tabu_extraction",
        "description": "Golden dataset for the Tabu (נסח טאבו) extractor.",
    },
    {
        "name": "agreement",
        "harness_dir": "agreement_eval_agent",
        "test_file": "agreement.test.json",
        "state_key": "agreement_extraction",
        "description": "Golden dataset for the Project Agreement (הסכם פרויקט) extractor.",
    },
    {
        "name": "company_docs",
        "harness_dir": "company_docs_eval_agent",
        "test_file": "company_docs.test.json",
        "state_key": "company_docs_extraction",
        "description": "Golden dataset for the Company Documents (מסמכי חברה) extractor.",
    },
    {
        "name": "zero_report",
        "harness_dir": "zero_report_eval_agent",
        "test_file": "zero_report.test.json",
        "state_key": "zero_report_extraction",
        "description": 'Golden dataset for the Zero Report (דו"ח אפס) extractor.',
    },
]

EXTRACTOR_FACTORY_MAP: dict[str, str] = {
    "tabu": "app.agents.extractors.tabu.agent",
    "agreement": "app.agents.extractors.project_agreement.agent",
    "company_docs": "app.agents.extractors.company_docs.agent",
    "zero_report": "app.agents.extractors.zero_report.agent",
}


async def run_extractor(
    cfg: dict,
    gcs_uris: list[str],
    doc_names: list[str],
    classification: dict,
) -> dict | None:
    """Run one extractor, write its .test.json, return captured state value."""
    import importlib

    from app.agents.constants import EXTRACTOR_DOC_TYPES, STATE_DOC_CLASSIFICATION, STATE_DOCUMENT_NAMES, STATE_GCS_URIS
    from app.agents.inject_utils import make_inject_pdfs

    module = importlib.import_module(EXTRACTOR_FACTORY_MAP[cfg["name"]])
    agent = module.create_agent()

    accepted = EXTRACTOR_DOC_TYPES.get(agent.name, [])
    empty_json = agent.output_schema().model_dump_json()
    agent.before_model_callback = make_inject_pdfs(accepted, empty_json)

    initial_state = {
        STATE_GCS_URIS: gcs_uris,
        STATE_DOCUMENT_NAMES: doc_names,
        STATE_DOC_CLASSIFICATION: classification,
    }

    logger.info("Running %s extractor …", cfg["name"])
    final_state = await _run_agent(agent, initial_state)

    captured = final_state.get(cfg["state_key"])
    if captured is None:
        logger.warning("%s extractor returned no output — skipping .test.json", cfg["name"])
        return None

    golden_json = json.dumps(captured, ensure_ascii=False, indent=2)

    eval_set = _make_eval_set(
        eval_set_id=f"{cfg['name']}_eval_set",
        description=cfg["description"],
        eval_id=f"{cfg['name']}_case_{EVAL_PROJECT_NAME}",
        session_state={
            STATE_GCS_URIS: gcs_uris,
            STATE_DOCUMENT_NAMES: doc_names,
            STATE_DOC_CLASSIFICATION: classification,
        },
        golden_response=golden_json,
    )

    test_path = EVAL_DIR / cfg["harness_dir"] / cfg["test_file"]
    _write_test_json(test_path, eval_set)
    return captured


# ---------------------------------------------------------------------------
# Stage 3 — Run synthesis
# ---------------------------------------------------------------------------


async def run_synthesis(
    extractor_outputs: dict,
    doc_names: list[str],
) -> None:
    """Run synthesis with pre-populated extractor state, write synthesis.test.json."""
    from app.agents.constants import STATE_DOCUMENT_NAMES, STATE_DOCAI_OUTPUT_URIS, STATE_ENRICHED_REPORT
    from app.agents.synthesis.agent import create_agent as create_synthesis_agents
    from google.adk.agents.sequential_agent import SequentialAgent

    main_agent, details_agent = create_synthesis_agents()
    pipeline = SequentialAgent(
        name="synthesis_eval_capture",
        sub_agents=[main_agent, details_agent],
    )

    initial_state = {
        STATE_DOCUMENT_NAMES: doc_names,
        STATE_DOCAI_OUTPUT_URIS: {},
        **extractor_outputs,
    }

    logger.info("Running synthesis …")
    final_state = await _run_agent(pipeline, initial_state)

    report = final_state.get(STATE_ENRICHED_REPORT) or final_state.get("finance_dd_report")
    if not report:
        logger.warning("Synthesis produced no report — skipping synthesis.test.json")
        return

    golden_json = json.dumps(report, ensure_ascii=False, indent=2)

    eval_set = _make_eval_set(
        eval_set_id="synthesis_eval_set",
        description="Golden dataset for the Senior Underwriter synthesis agent.",
        eval_id=f"synthesis_case_{EVAL_PROJECT_NAME}",
        session_state={
            STATE_DOCUMENT_NAMES: doc_names,
            STATE_DOCAI_OUTPUT_URIS: {},
            **extractor_outputs,
        },
        golden_response=golden_json,
    )

    test_path = EVAL_DIR / "synthesis_eval_agent" / "synthesis.test.json"
    _write_test_json(test_path, eval_set)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def main() -> None:
    if not EVAL_PROJECT_NAME:
        logger.error(
            "EVAL_PROJECT_NAME is not set. "
            "Export it before running: export EVAL_PROJECT_NAME=<folder_name>"
        )
        sys.exit(1)

    prefix = f"test-docs/{EVAL_PROJECT_NAME}/"
    logger.info("Listing PDFs at gs://%s/%s …", EVAL_GCS_BUCKET, prefix)
    gcs_uris = list_gcs_pdfs(EVAL_GCS_BUCKET, prefix)
    doc_names = [uri.rsplit("/", 1)[-1] for uri in gcs_uris]

    logger.info("Documents: %s", doc_names)

    # Stage 1: classify
    classification = await run_classifier(gcs_uris, doc_names)

    # Stage 2: run extractors
    extractor_outputs: dict = {}
    for cfg in EXTRACTOR_CONFIGS:
        captured = await run_extractor(cfg, gcs_uris, doc_names, classification)
        if captured is not None:
            extractor_outputs[cfg["state_key"]] = captured

    # Stage 3: synthesis
    if extractor_outputs:
        await run_synthesis(extractor_outputs, doc_names)
    else:
        logger.warning("No extractor output captured — skipping synthesis.")

    logger.info("Done. Review .test.json files and commit them as golden datasets.")


if __name__ == "__main__":
    asyncio.run(main())
