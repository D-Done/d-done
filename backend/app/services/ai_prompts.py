"""AI prompt settings storage.

MVP persistence:
- Store prompt templates in GCS as JSON (no DB migrations).

Object path:
- ``gs://<bucket>/settings/ai-prompts.json``
"""

from __future__ import annotations

import json
import logging
from typing import Final

from google.api_core import exceptions as gcs_exceptions
from google.cloud import storage

from app.services.gcs import _get_client, _get_or_create_bucket

logger = logging.getLogger(__name__)

AI_PROMPTS_OBJECT: Final[str] = "settings/ai-prompts.json"

ALLOWED_DEAL_TYPES: Final[set[str]] = {"real_estate", "ma", "company_investment", "other"}

ALLOWED_REAL_ESTATE_TYPES: Final[set[str]] = {
    "apartment_sale",
    "urban_renewal",
    "project_finance",
}

# Prompt keys are what we persist in GCS / expose via the settings API.
# For real-estate we support different prompts per sub-type.
ALLOWED_PROMPT_KEYS: Final[set[str]] = {
    "real_estate",  # fallback/default
    "real_estate.apartment_sale",
    "real_estate.urban_renewal",
    "real_estate.project_finance",
    "ma",
    "company_investment",
    "other",
}


def _normalize_prompts(data: dict) -> dict[str, str]:
    prompts: dict[str, str] = {}
    for k, v in (data or {}).items():
        if not isinstance(k, str):
            continue
        if k not in ALLOWED_PROMPT_KEYS:
            continue
        if v is None:
            prompts[k] = ""
        elif isinstance(v, str):
            prompts[k] = v
        else:
            prompts[k] = str(v)
    return prompts


def get_ai_prompts() -> dict[str, str]:
    """Load AI prompts mapping from GCS.

    Returns an empty dict if not yet configured.
    """
    client: storage.Client = _get_client()
    bucket = _get_or_create_bucket(client)
    blob = bucket.blob(AI_PROMPTS_OBJECT)

    try:
        raw = blob.download_as_text(encoding="utf-8")
    except gcs_exceptions.NotFound:
        return {}
    except Exception:
        logger.exception("Failed reading AI prompts from GCS")
        return {}

    try:
        return _normalize_prompts(json.loads(raw))
    except Exception:
        logger.exception("Failed parsing AI prompts JSON from GCS")
        return {}


def put_ai_prompts(prompts: dict[str, str]) -> dict[str, str]:
    """Persist AI prompts mapping to GCS and return the stored value."""
    normalized = _normalize_prompts(prompts)

    client: storage.Client = _get_client()
    bucket = _get_or_create_bucket(client)
    blob = bucket.blob(AI_PROMPTS_OBJECT)

    blob.upload_from_string(
        json.dumps(normalized, ensure_ascii=False, indent=2) + "\n",
        content_type="application/json; charset=utf-8",
    )

    return normalized

