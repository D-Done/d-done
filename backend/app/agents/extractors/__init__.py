"""Document extractor agents for the Finance DD pipeline.

Each agent is specialised for a single document type and outputs structured
JSON that the synthesis agent consumes.
"""

from app.agents.extractors.project_agreement.schema import AgreementExtraction
from app.agents.extractors.project_agreement_additions.schema import (
    AgreementAdditionsExtraction,
)
from app.agents.extractors.company_docs.schema import CompanyDocsExtraction
from app.agents.extractors.credit_committee.schema import CreditCommitteeExtraction
from app.agents.extractors.planning_permit.schema import PlanningPermitExtraction
from app.agents.extractors.pledges_registry.schema import PledgesRegistryExtraction
from app.agents.extractors.signing_protocol.schema import SigningProtocolExtraction
from app.agents.extractors.tabu.schema import TabuExtraction
from app.agents.extractors.zero_report.schema import ZeroReportExtraction

__all__ = [
    "AgreementExtraction",
    "AgreementAdditionsExtraction",
    "CompanyDocsExtraction",
    "CreditCommitteeExtraction",
    "PlanningPermitExtraction",
    "PledgesRegistryExtraction",
    "SigningProtocolExtraction",
    "TabuExtraction",
    "ZeroReportExtraction",
]
