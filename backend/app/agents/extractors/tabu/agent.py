"""Tabu Extract agent (נסח טאבו).

Reads Israeli Land Registry extracts and outputs a structured
``TabuExtraction`` JSON. Instruction from ``prompt.py``.
"""

from __future__ import annotations

import logging

from google.adk.agents import Agent
from app.agents.utils import (
    generate_content_config as _generate_content_config,
)

from app.agents.extractors.tabu.prompt import get_prompt
from app.agents.extractors.tabu.schema import TabuExtractionResult
from app.core.config import settings

logger = logging.getLogger(__name__)

AGENT_NAME = "tabu_extractor"
MODEL = settings.gemini_pro_model


def create_agent() -> Agent:
    """Create the Tabu-extract ADK agent."""
    return Agent(
        name=AGENT_NAME,
        model=MODEL,
        instruction=get_prompt(),
        description=(
            "מומחה נסח טאבו — חילוץ בעלויות, הערות אזהרה, "
            "הערות מגבילות ומשכנתאות מנסחי טאבו בדיוק גבוה."
        ),
        output_schema=TabuExtractionResult,
        output_key="tabu_extraction",
        generate_content_config=_generate_content_config(max_output_tokens=65536),
    )
