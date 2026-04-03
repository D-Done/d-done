"""Shared ADK/Gemini utilities for the agent pipeline."""

from __future__ import annotations

import logging

from google.genai import types as genai_types

logger = logging.getLogger(__name__)

_DEFAULT_INITIAL_DELAY = 5
_DEFAULT_ATTEMPTS = 8
_EXTRACTOR_MAX_OUTPUT_TOKENS = 8192


def make_generate_config(
    *,
    initial_delay: int = _DEFAULT_INITIAL_DELAY,
    attempts: int = _DEFAULT_ATTEMPTS,
    max_output_tokens: int | None = None,
) -> genai_types.GenerateContentConfig | None:
    """Return a GenerateContentConfig with exponential-backoff retry options.

    Shared by all agents that need consistent 429-handling behaviour.
    Returns None on failure so callers can omit the config and fall back to
    model defaults rather than crashing at startup.
    """
    try:
        kwargs: dict = dict(
            http_options=genai_types.HttpOptions(
                retry_options=genai_types.HttpRetryOptions(
                    initial_delay=initial_delay,
                    attempts=attempts,
                ),
            ),
        )
        if max_output_tokens is not None:
            kwargs["max_output_tokens"] = max_output_tokens
        return genai_types.GenerateContentConfig(**kwargs)
    except Exception as exc:
        logger.warning(
            "GenerateContentConfig setup failed (%s) — running with defaults.", exc
        )
        return None


def generate_content_config(
    max_output_tokens: int = _EXTRACTOR_MAX_OUTPUT_TOKENS,
) -> genai_types.GenerateContentConfig:
    """Convenience wrapper for Flash extractor agents (includes 8 192-token default)."""
    cfg = make_generate_config(max_output_tokens=max_output_tokens)
    if cfg is not None:
        return cfg
    return genai_types.GenerateContentConfig(max_output_tokens=max_output_tokens)
