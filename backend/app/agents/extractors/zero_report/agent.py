"""Zero Report Specialist agent (דו״ח אפס).

Reads Israeli economic-feasibility (Zero Report) documents and outputs
structured ``ZeroReportExtraction`` JSON. Instruction from ``prompt.py``.
"""

from __future__ import annotations

import logging

from google.adk.agents import Agent
from google.genai import types
from app.agents.utils import (
    generate_content_config as _generate_content_config,
)

from app.agents.extractors.zero_report.prompt import get_prompt
from app.agents.extractors.zero_report.schema import ZeroReportExtraction
from app.core.config import settings

logger = logging.getLogger(__name__)

AGENT_NAME = "zero_report_extractor"
MODEL = settings.gemini_flash_model


def create_agent() -> Agent:
    """Create the Zero-Report ADK agent."""
    return Agent(
        name=AGENT_NAME,
        model=MODEL,
        instruction=get_prompt(),
        description='מומחה דו"ח אפס — מחלץ נתונים כספיים, רווחיות, מגבלות בנייה והצמדה למדד.',
        output_schema=ZeroReportExtraction,
        output_key="zero_report_extraction",
        generate_content_config=_generate_content_config(),
    )
