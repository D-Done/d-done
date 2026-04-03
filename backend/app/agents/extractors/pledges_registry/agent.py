"""Pledges Registry agent (רשם המשכונות — Rasham Hamashkonot).

Reads Israeli Pledges Register Reports and outputs structured
``PledgesRegistryExtraction``: pledgees (בעלי המשכון) cross-referenced
with controlling shareholders.
"""

from __future__ import annotations

import logging

from google.adk.agents import Agent
from google.genai import types

from app.agents.utils import (
    generate_content_config as _generate_content_config,
)
from app.agents.extractors.pledges_registry.prompt import get_prompt
from app.agents.extractors.pledges_registry.schema import PledgesRegistryExtraction
from app.core.config import settings

logger = logging.getLogger(__name__)

AGENT_NAME = "pledges_registry_extractor"
MODEL = settings.gemini_flash_model


def create_agent() -> Agent:
    """Create the Pledges Registry ADK agent."""
    return Agent(
        name=AGENT_NAME,
        model=MODEL,
        instruction=get_prompt(),
        description='מחלץ משכונות לטובת בעלי שליטה מדו"ח רשם המשכונות (Rasham Hamashkonot).',
        output_schema=PledgesRegistryExtraction,
        output_key="pledges_registry_extraction",
        generate_content_config=_generate_content_config(),
    )
