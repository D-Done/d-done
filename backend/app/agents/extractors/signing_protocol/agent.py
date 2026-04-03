"""Signing Protocol agent (פרוטוקול מורשה חתימה).

Reads Israeli signing-authority protocols and outputs structured
``SigningProtocolExtraction`` JSON. Instruction from ``prompt.py``.
"""

from __future__ import annotations

import logging

from google.adk.agents import Agent
from google.genai import types
from app.agents.utils import (
    generate_content_config as _generate_content_config,
)

from app.agents.extractors.signing_protocol.prompt import get_prompt
from app.agents.extractors.signing_protocol.schema import SigningProtocolExtraction
from app.core.config import settings

logger = logging.getLogger(__name__)

AGENT_NAME = "signing_protocol_extractor"
MODEL = settings.gemini_flash_model


def create_agent() -> Agent:
    """Create the Signing-Protocol ADK agent."""
    return Agent(
        name=AGENT_NAME,
        model=MODEL,
        instruction=get_prompt(),
        description="מחלץ נתונים מפרוטוקולי מורשי חתימה — חותמים מורשים, הרכבי חתימה.",
        output_schema=SigningProtocolExtraction,
        output_key="signing_protocol_extraction",
        generate_content_config=_generate_content_config(),
    )
