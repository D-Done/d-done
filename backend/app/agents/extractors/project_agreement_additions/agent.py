"""Agreement Additions agent (תוספות להסכם).

Reads addenda and amendments to project agreements and outputs structured
``AgreementAdditionsExtraction`` JSON. Instruction from ``prompt.py``.
"""

from __future__ import annotations

import logging

from google.adk.agents import Agent
from google.genai import types
from app.agents.utils import (
    generate_content_config as _generate_content_config,
)

from app.agents.extractors.project_agreement_additions.prompt import (
    AGREEMENT_ADDITIONS_PROMPT_TEMPLATE,
)
from app.agents.extractors.project_agreement_additions.schema import (
    AgreementAdditionsExtraction,
)
from app.core.config import settings

logger = logging.getLogger(__name__)

AGENT_NAME = "agreement_additions_extractor"
MODEL = settings.gemini_flash_model


def create_agent() -> Agent:
    """Create the Agreement Additions ADK agent."""
    return Agent(
        name=AGENT_NAME,
        model=MODEL,
        instruction=AGREEMENT_ADDITIONS_PROMPT_TEMPLATE,
        description="מחלץ נתונים מתוספות להסכם ונסוחים — תאריכים, סעיפים משונו, צדדים.",
        output_schema=AgreementAdditionsExtraction,
        output_key="agreement_additions_extraction",
        generate_content_config=_generate_content_config(),
    )
