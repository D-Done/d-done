"""Planning Permit / Committee Decision agent (היתר בניה / החלטת ועדה).

Reads Israeli building permits and planning-committee decisions and outputs
structured ``PlanningPermitExtraction`` JSON. Instruction from ``prompt.py``.
"""

from __future__ import annotations

import logging

from google.adk.agents import Agent
from google.genai import types
from app.agents.utils import (
    generate_content_config as _generate_content_config,
)

from app.agents.extractors.planning_permit.prompt import get_prompt
from app.agents.extractors.planning_permit.schema import PlanningPermitExtraction
from app.core.config import settings

logger = logging.getLogger(__name__)

AGENT_NAME = "planning_permit_extractor"
MODEL = settings.gemini_flash_model


def create_agent() -> Agent:
    """Create the Planning-Permit / Committee-Decision ADK agent."""
    return Agent(
        name=AGENT_NAME,
        model=MODEL,
        instruction=get_prompt(),
        description="מחלץ מידע מובנה מהיתרי בניה והחלטות ועדה — תוקף, היקף, תנאים.",
        output_schema=PlanningPermitExtraction,
        output_key="planning_permit_extraction",
        generate_content_config=_generate_content_config(),
    )
