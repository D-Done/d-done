"""Document classifier agent.

Runs as the first step in the finance pipeline. Receives all uploaded PDFs
via Part.from_uri and classifies each one by looking at its first page,
then writes a filename → doc_type map to session state.

Downstream extractor callbacks read this map to inject only the relevant
subset of files into each extractor's LLM request.
"""

from __future__ import annotations

from google.adk.agents import Agent

from app.agents.constants import FLASH_MODEL, STATE_DOC_CLASSIFICATION
from app.agents.schemas import DocumentClassificationResult
from app.agents.utils import make_generate_config

_CLASSIFIER_PROMPT = """\
You are a document classifier for an Israeli real estate due-diligence pipeline.

You will receive a set of PDF documents. Look at the **first page only** of each
document to identify its type. The first page always contains the document title
or a clear header (e.g. "נסח רישום מקרקעין", "הסכם פינוי-בינוי", "דו"ח אפס").

## Document manifest

The user message includes a numbered list of filenames under the heading
"## Documents (N) — VALID FILENAMES". Use these **exact** filenames as keys
in your output.

## Classification labels

Assign exactly one label per document:

| Label                  | Document type                                                      |
| ---------------------- | ------------------------------------------------------------------ |
| `tabu`                 | נסח טאבו / נסח רישום מקרקעין (land registry extract)              |
| `project_agreement`    | הסכם פינוי-בינוי / הסכם תמ"א 38 (main project agreement)          |
| `agreement_additions`  | תוספת להסכם / נספח / addendum to the project agreement            |
| `zero_report`          | דו"ח אפס / חוות דעת שמאי (appraiser zero report)                  |
| `credit_committee`     | ועדת אשראי / בקשת אשראי (credit committee protocol or application) |
| `company_docs`         | נסח חברה / תקנון / תעודת התאגדות (company registry extract)       |
| `signing_protocol`     | פרוטוקול מורשי חתימה / אישור חתימה (signing authority protocol)   |
| `planning_permit`      | היתר בנייה / החלטת ועדה / תב"ע (planning permit or committee decision) |
| `pledges_registry`     | רשם המשכונות / שעבוד (pledges registry extract)                   |
| `other`                | Any document that does not match the above types                   |

## Output

Return a single JSON object with one field `classifications` — a dict mapping
each filename to its label. Include every file from the manifest.

Example:
```json
{
  "classifications": {
    "נסח טאבו גוש 6660 חלקה 590.pdf": "tabu",
    "הסכם פינוי בינוי רחוב הרצל 12.pdf": "project_agreement",
    "תוספת מס 1 להסכם.pdf": "agreement_additions",
    "דוח אפס ינואר 2024.pdf": "zero_report"
  }
}
```
"""


def create_classifier_agent() -> Agent:
    """Create the document classifier Flash agent."""
    return Agent(
        name="doc_classifier",
        model=FLASH_MODEL,
        instruction=_CLASSIFIER_PROMPT,
        description=(
            "Classifies each uploaded PDF by document type (tabu, agreement, "
            "zero_report, etc.) by reading the first page of each file. "
            "Output is used to route files to the correct specialist extractor."
        ),
        include_contents="none",
        output_schema=DocumentClassificationResult,
        output_key=STATE_DOC_CLASSIFICATION,
        generate_content_config=make_generate_config(),
    )
