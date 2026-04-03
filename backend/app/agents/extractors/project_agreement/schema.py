"""Project Agreement (הסכם פרויקט) extractor schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.agents.schemas import EvidentiaryReference
from app.agents.extractors.schemas import ExtractorTimelineEvent


class ProfessionalRepresentative(BaseModel):
    """A designated legal counsel for one of the parties."""

    name: str = Field(description="Representative name")
    role: str = Field(description="Role: בא כוח הדיירים / בא כוח היזם/החברה")
    id_number: str | None = Field(default=None, description="ID number")
    source: EvidentiaryReference | None = Field(
        default=None,
        description="אסמכתא ראייתית — source_document_name, page_number, verbatim_quote",
    )


class GuaranteeRecord(BaseModel):
    """A guarantee the developer must provide per the agreement."""

    guarantee_type: str = Field(description="Type of guarantee in Hebrew")
    amount: str | None = Field(default=None, description="Amount or formula as stated")
    trigger_condition: str | None = Field(
        default=None, description="Timing or trigger condition"
    )
    source: EvidentiaryReference | None = Field(
        default=None,
        description="אסמכתא ראייתית — source_document_name, page_number, verbatim_quote",
    )


class ProjectScope(BaseModel):
    """Unit counts for the project as described in the agreement."""

    owner_replacement_units: int | None = Field(
        default=None,
        description="Number of owner/tenant replacement units (דירות הבעלים / דירות התמורה)",
    )
    developer_units: int | None = Field(
        default=None, description="Number of developer units (דירות היזם)"
    )
    total_planned_units: int | None = Field(
        default=None, description="Total planned units in the new building"
    )
    unit_range: str | None = Field(
        default=None, description="Min/max unit range if stated"
    )


class UpgradeDowngradeTerms(BaseModel):
    """Whether tenants may upgrade/downgrade their replacement apartments."""

    upgrade_allowed: bool | None = Field(
        default=None, description="Whether upgrade is allowed"
    )
    upgrade_details: str | None = Field(
        default=None, description="Mechanism/conditions for upgrade"
    )
    downgrade_allowed: bool | None = Field(
        default=None, description="Whether downgrade/reduction is allowed"
    )
    downgrade_details: str | None = Field(
        default=None, description="Mechanism/compensation for downgrade"
    )


class TimelineMilestone(BaseModel):
    """A project milestone with its deadline or condition."""

    milestone: str = Field(description="Milestone name in Hebrew")
    deadline_or_condition: str = Field(
        description="Deadline, duration, or condition as stated"
    )
    source: EvidentiaryReference | None = Field(
        default=None,
        description="אסמכתא ראייתית — source_document_name, page_number, verbatim_quote",
    )


class TenantRecord(BaseModel):
    """A tenant/owner signing record from the agreement."""

    sub_parcel: str = Field(description="Sub-parcel identifier")
    owner_name: str = Field(description="Tenant / owner name")
    is_signed: bool = Field(description="Whether the tenant signed the agreement")
    date_signed: str | None = Field(default=None, description="YYYY-MM-DD")
    source: EvidentiaryReference | None = Field(
        default=None,
        description="אסמכתא ראייתית — source_document_name, page_number, verbatim_quote",
    )


class AgreementExtraction(BaseModel):
    """Structured output of the Project Agreement extractor."""

    # TASK 1
    agreement_type: str | None = Field(
        default=None,
        description='Project type: תמ"א 38/1, תמ"א 38/2, or פינוי בינוי'
    )

    # TASK 2
    address: str | None = Field(
        default=None, description="Property address from the agreement"
    )
    block: str | None = Field(default=None, description="Block (גוש)")
    parcel: str | None = Field(default=None, description="Parcel (חלקה)")
    sub_parcels_listed: list[str] = Field(
        default_factory=list,
        description="Sub-parcel identifiers listed in the agreement",
    )

    # TASK 3
    professional_representatives: list[ProfessionalRepresentative] = Field(
        default_factory=list,
        description="Designated legal counsels (בא כוח הדיירים / בא כוח היזם)",
    )

    # TASK 4
    lender_name: str | None = Field(
        default=None,
        description="Only if the agreement explicitly names a specific lending institution; otherwise null.",
    )
    lender_type: str | None = Field(
        default=None,
        description="Type of lending entity: bank / insurance / fund.",
    )
    lender_definition_clause: str | None = Field(
        default=None,
        description="Full verbatim Hebrew text of the clause that defines who may be the lender (גורם מממן). Include the entire clause: all banks, insurance companies, funds and conditions — do not summarize.",
    )
    lender_allows_funds: bool | None = Field(
        default=None,
        description="True if the definition allows investment funds (קרנות), not only banks/insurance.",
    )
    guarantees: list[GuaranteeRecord] = Field(
        default_factory=list, description="Guarantees the developer must provide"
    )
    alternative_financing: str | None = Field(
        default=None,
        description=(
            "Whether the agreement allows/restricts/is silent on mezzanine financing, "
            "external equity, debt fund, bridge financing, or additional financiers"
        ),
    )
    alternative_financing_conditions: str | None = Field(
        default=None,
        description="Conditions for using alternative financing (consent, limitations, etc.)",
    )

    # TASK 5
    project_scope: ProjectScope | None = Field(
        default=None, description="Project unit counts"
    )

    # TASK 6
    upgrade_downgrade_terms: UpgradeDowngradeTerms | None = Field(
        default=None,
        description="Tenant upgrade/downgrade options for replacement apartments",
    )

    # TASK 7
    project_timelines: list[TimelineMilestone] = Field(
        default_factory=list,
        description="Key project milestones with deadlines/conditions",
    )

    # TASK 8
    tenant_records: list[TenantRecord] = Field(
        default_factory=list,
        description="Per sub-parcel tenant signing records",
    )

    # TASK 9
    developer_signed_date: str | None = Field(
        default=None,
        description="Date the developer signed the agreement (YYYY-MM-DD)",
    )
    developer_signatory_name: str | None = Field(
        default=None,
        description="Name of the person who signed on behalf of the developer company",
    )
    developer_signatory_id: str | None = Field(
        default=None,
        description="ID number of the developer signatory, if stated",
    )

    # Standard
    timeline_events: list[ExtractorTimelineEvent] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


__all__ = ["AgreementExtraction"]
