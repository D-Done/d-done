from __future__ import annotations

from typing import Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ProjectCreateBase(BaseModel):
    """Base request for creating a project.

    This schema is designed to map 1:1 with the Hebrew UI labels via `Field(description=...)`.
    """

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    transaction_type: str = Field(..., description="סוג העסקה")

    project_name: str = Field(
        ...,
        min_length=2,
        max_length=200,
        description="שם הפרויקט",
    )
    client_name: str | None = Field(
        None,
        min_length=2,
        max_length=200,
        description="שם הלקוח",
    )
    role: str | None = Field(None, description="מי אתה מייצג בעסקה?")
    role_other: str | None = Field(
        None,
        max_length=200,
        description="פירוט כאשר נבחר 'אחר'",
    )
    counterparty_name: str | None = Field(
        None,
        max_length=200,
        description="שם היזם",
    )
    description: str | None = Field(None, max_length=5000, description="תיאור הפרויקט")

    @field_validator(
        "project_name",
        "client_name",
        "counterparty_name",
        "role",
        "role_other",
        mode="before",
    )
    @classmethod
    def _empty_to_none_and_strip(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            vv = v.strip()
            return vv or None
        return v

    def to_title_description(self) -> tuple[str, str | None]:
        """Map the structured request to the current DB fields (title, description)."""
        lines: list[str] = []
        if self.client_name:
            lines.append(f"- שם הלקוח: {self.client_name}")
        if self.role:
            display = (
                f"אחר: {self.role_other.strip()}"
                if self.role == "אחר" and self.role_other and self.role_other.strip()
                else self.role
            )
            lines.append(f"- מי אתה מייצג בעסקה?: {display}")
        if self.counterparty_name:
            lines.append(f"- הצד הנגדי: {self.counterparty_name}")
        meta_block = None
        if lines:
            meta_block = "\n".join(["---", "פרטי פרויקט", *lines])

        free_text = (self.description or "").strip()
        combined = "\n\n".join([s for s in [free_text, meta_block] if s]).strip()
        return self.project_name, combined or None


class RealEstateFinancingSchema(ProjectCreateBase):
    """Strict validation for Real Estate Financing projects."""

    transaction_type: Literal["real_estate_financing"] = Field(
        "real_estate_financing",
        description='סוג העסקה ("מימון נדל״ן")',
    )

    client_name: str = Field(
        ...,
        min_length=2,
        max_length=200,
        description="שם הלקוח",
    )
    role: Literal["בנק", "חברת ביטוח", "קרן", "אחר"] = Field(
        ...,
        description="מי אתה מייצג בעסקה?",
    )


class GenericProjectCreateSchema(ProjectCreateBase):
    """Fallback schema for other transaction types."""

    transaction_type: str = Field(..., min_length=1, description="סוג העסקה")


class ProjectCreateBrainRequest(ProjectCreateBase):
    """Transaction-type aware create request (the 'Brain').

    We keep a single request model for the API to avoid discriminated-union
    constraints in Pydantic v2, and then delegate strict validation to the
    appropriate subclass.
    """

    @model_validator(mode="after")
    def _validate_by_transaction_type(self):
        if self.transaction_type == "real_estate_financing":
            # Enforce strict rules for this specific transaction type
            RealEstateFinancingSchema.model_validate(self.model_dump())
        else:
            # Minimal validation for other types (already enforced by base).
            GenericProjectCreateSchema.model_validate(self.model_dump())
        return self


class ProjectCreateLegacyRequest(BaseModel):
    """Backward-compatible request body used by older frontends."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=500)
    description: str | None = None


ProjectCreateRequest = Union[ProjectCreateLegacyRequest, ProjectCreateBrainRequest]
