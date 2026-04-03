"""Credit Committee agent (ועדת אשראי).

Reads Israeli bank/fund credit-committee documents and outputs structured
``CreditCommitteeExtraction`` JSON. Instruction from ``prompt.py``.
"""

from __future__ import annotations

import logging

from google.adk.agents import Agent
from google.genai import types
from app.agents.utils import (
    generate_content_config as _generate_content_config,
)

from app.agents.extractors.credit_committee.prompt import get_prompt
from app.agents.extractors.credit_committee.schema import CreditCommitteeExtraction
from app.core.config import settings

logger = logging.getLogger(__name__)

AGENT_NAME = "credit_committee_extractor"
MODEL = settings.gemini_flash_model


def create_agent() -> Agent:
    """Create the Credit-Committee ADK agent."""
    return Agent(
        name=AGENT_NAME,
        model=MODEL,
        instruction=get_prompt(),
        description="מחלץ נתונים ממסמכי ועדת אשראי — סכומים, תנאים מתלים, בטוחות.",
        output_schema=CreditCommitteeExtraction,
        output_key="credit_committee_extraction",
        generate_content_config=_generate_content_config(),
    )
