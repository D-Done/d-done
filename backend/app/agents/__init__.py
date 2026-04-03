"""Due-diligence agents built on Google Agent Development Kit (ADK).

Architecture
------------
- **Visual Grounding pipeline** (``SequentialAgent``): Classifier → Extractors (3.1 Pro) → Synthesis (2.5 Pro).
- Extractors use Gemini 3.1 Pro with native PDF + box_2d citations.
- Synthesis uses Gemini 2.5 Pro; no DocAI or citation resolver.
"""

from app.agents.visual_grounding_pipeline_agent import (
    create_visual_grounding_pipeline,
    create_visual_grounding_pipeline_phase1,
)

__all__ = [
    "create_visual_grounding_pipeline",
    "create_visual_grounding_pipeline_phase1",
]
