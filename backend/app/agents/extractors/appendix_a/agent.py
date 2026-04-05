"""Appendix A fact extractor — Credit Committee materials only.

Outputs structured ``AppendixAExtraction`` JSON. Instruction from ``prompt.py``.
"""

from __future__ import annotations

from google.adk.agents import Agent

from app.agents.extractors.appendix_a.prompt import get_prompt
from app.agents.extractors.appendix_a.schema import AppendixAExtraction
from app.agents.utils import generate_content_config as _generate_content_config
from app.core.config import settings

AGENT_NAME = "appendix_a_extractor"
MODEL = settings.gemini_flash_model


def create_agent() -> Agent:
    """Create the Appendix A ADK agent."""
    return Agent(
        name=AGENT_NAME,
        model=MODEL,
        instruction=get_prompt(),
        description=(
            "Extracts structured Appendix A facts from Credit Committee materials only: "
            "financing structure, guarantees, equity, conditions precedent, milestones, "
            "and related terms."
        ),
        output_schema=AppendixAExtraction,
        output_key="appendix_a_extraction",
        generate_content_config=_generate_content_config(),
    )
