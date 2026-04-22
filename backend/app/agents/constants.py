"""Shared constants for the DD agent pipeline."""

from app.core.config import settings

# --- Models ----------------------------------------------------------------

FLASH_MODEL = settings.gemini_flash_model
PRO_MODEL = settings.gemini_pro_model

# --- Session state keys ----------------------------------------------------

STATE_PROJECT_ID = "project_id"
STATE_GCS_URIS = "gcs_uris"
STATE_DOCUMENT_NAMES = "document_names"
# Per-file MIME types parallel to STATE_GCS_URIS (e.g. "image/jpeg" for images)
STATE_CONTENT_TYPES = "content_types"
# Per-file sizes in bytes parallel to STATE_GCS_URIS (used to skip oversized files)
STATE_FILE_SIZES = "file_sizes"
# Dict[filename, extracted_text] for non-PDF/image files (Excel, Word, CSV…)
STATE_TEXT_PARTS = "text_parts"

STATE_DOCAI_OUTPUT_URIS = "docai_output_uris"
STATE_ENRICHED_REPORT = "enriched_report"
STATE_DOC_CLASSIFICATION = "doc_classification"

EXTRACTOR_DOC_TYPES: dict[str, list[str]] = {
    "tabu_extractor": ["tabu"],
    "agreement_extractor": ["project_agreement"],
    "agreement_additions_extractor": ["agreement_additions"],
    "zero_report_extractor": ["zero_report"],
    "credit_committee_extractor": ["credit_committee"],
    "appendix_a_extractor": ["credit_committee"],
    "company_docs_extractor": ["company_docs"],
    "signing_protocol_extractor": ["signing_protocol"],
    "planning_permit_extractor": ["planning_permit"],
    "pledges_registry_extractor": ["pledges_registry"],
    "other_docs_extractor": ["other"],
}

# --- ADK identifiers -------------------------------------------------------

APP_NAME = "d-done"
SYSTEM_USER_ID = "dd-system"
