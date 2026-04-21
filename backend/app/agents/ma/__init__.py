"""M&A (Mergers & Acquisitions) DD pipeline — v1 (non-RAG).

See Linear D-157. Mirrors the finance visual-grounding pipeline but targets the
10 mandatory M&A chapters instead of real-estate extractors. Classifier assigns
multi-label chapter tags per document; each chapter agent receives only the
tagged subset and emits its typed schema with ``box_2d`` citations.
"""

from app.agents.ma.pipeline import create_ma_pipeline
from app.agents.ma.report_schema import MaDDReport

__all__ = ["create_ma_pipeline", "MaDDReport"]
