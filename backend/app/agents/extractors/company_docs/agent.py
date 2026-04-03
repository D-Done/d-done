"""Company Documents agent (מסמכי חברה).

Reads Israeli Companies Registrar extracts and incorporation documents and
outputs structured ``CompanyDocsExtraction`` JSON. Instruction from ``prompt.py``.
"""

from __future__ import annotations

import logging

from google.adk.agents import Agent
from app.agents.utils import generate_content_config as _generate_content_config

from app.agents.extractors.company_docs.prompt import get_prompt
from app.agents.extractors.company_docs.schema import CompanyDocsExtractionResult
from app.core.config import settings

logger = logging.getLogger(__name__)

AGENT_NAME = "company_docs_extractor"
MODEL = settings.gemini_flash_model


def create_agent() -> Agent:
    """Create the Company-Documents ADK agent."""
    return Agent(
        name=AGENT_NAME,
        model=MODEL,
        instruction=get_prompt(),
        description="מחלץ נתונים ממסמכי חברה — בעלי מניות, נושאי משרה, שרשרת UBO.",
        output_schema=CompanyDocsExtractionResult,
        output_key="company_docs_extraction",
        generate_content_config=_generate_content_config(),
    )
