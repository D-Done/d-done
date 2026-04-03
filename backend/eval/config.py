"""Eval configuration — reads from environment variables.

Set before running capture_golden.py or pytest:

    export EVAL_GCS_BUCKET=d-done-eval
    export EVAL_PROJECT_NAME=<your_test_project_folder_name>
"""

from __future__ import annotations

import os

EVAL_GCS_BUCKET: str = os.environ.get("EVAL_GCS_BUCKET", "d-done-eval")

# The folder name inside the bucket: test_docs/<project_name>/
EVAL_PROJECT_NAME: str = os.environ.get("EVAL_PROJECT_NAME", "")

GCS_PREFIX: str = f"test-docs/{EVAL_PROJECT_NAME}" if EVAL_PROJECT_NAME else "test-docs"

# Fully-qualified GCS URI base (no trailing slash)
EVAL_BASE_URI: str = f"gs://{EVAL_GCS_BUCKET}/{GCS_PREFIX}"

ADK_APP_NAME: str = "d-done"
ADK_EVAL_USER_ID: str = "dd-eval"
