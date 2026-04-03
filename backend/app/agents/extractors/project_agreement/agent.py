"""Project Agreement agent (הסכם פרויקט).

Reads Israeli project agreements and TAMA documents and outputs structured
``AgreementExtraction`` JSON. Instruction from ``prompt.py``.
"""

from __future__ import annotations

import logging

from google.adk.agents import Agent
from google.genai import types
from app.agents.utils import generate_content_config as _generate_content_config

from app.agents.extractors.project_agreement.prompt import get_prompt
from app.agents.extractors.project_agreement.schema import AgreementExtraction
from app.core.config import settings

logger = logging.getLogger(__name__)

AGENT_NAME = "agreement_extractor"
MODEL = settings.gemini_pro_model


def create_agent() -> Agent:
    """Create the Agreement / TAMA ADK agent."""
    return Agent(
        name=AGENT_NAME,
        model=MODEL,
        instruction=get_prompt(),
        description="מחלץ נתוני הסכם פרויקט — הגדרת מממן, ערבויות, היקף פרויקט, חתימות דיירים.",
        output_schema=AgreementExtraction,
        output_key="agreement_extraction",
        generate_content_config=_generate_content_config(max_output_tokens=65536),
    )
