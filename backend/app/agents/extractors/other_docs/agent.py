"""Other / General document agent (מסמכים נוספים — אחר).

Reads documents that do not match a specialist extractor and outputs
structured ``OtherDocExtraction`` JSON. Instruction from ``prompt.py``.
"""

from __future__ import annotations

import logging

from google.adk.agents import Agent
from google.genai import types
from app.agents.utils import (
    generate_content_config as _generate_content_config,
)

from app.agents.extractors.other_docs.prompt import OTHER_DOCS_PROMPT_TEMPLATE
from app.agents.extractors.other_docs.schema import OtherDocExtraction
from app.core.config import settings

logger = logging.getLogger(__name__)

AGENT_NAME = "other_docs_extractor"
MODEL = settings.gemini_flash_model


def create_agent() -> Agent:
    """Create the Other / General documents ADK agent."""
    return Agent(
        name=AGENT_NAME,
        model=MODEL,
        instruction=OTHER_DOCS_PROMPT_TEMPLATE,
        description=(
            "מחלץ מסמכים כלליים — חילוץ צדדים, תאריכים, התחייבויות "
            "ודגלים אדומים ממסמכים שאינם מתאימים למחלץ מתמחה."
        ),
        output_schema=OtherDocExtraction,
        output_key="other_docs_extraction",
        generate_content_config=_generate_content_config(),
    )
