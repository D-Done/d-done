"""Settings endpoints.

Includes AI prompt templates management and agent prompt file management.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import CurrentUser, get_approved_user
from app.services.ai_prompts import ALLOWED_PROMPT_KEYS, get_ai_prompts, put_ai_prompts

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])

# Agent prompt content: extractors under extractors/<name>, others at agents/<name>.
# file_key -> (prompt_module_path, path_relative_to_agents_for_override_write)
_AGENT_PROMPT_MODULES: dict[str, tuple[str, str]] = {
    "tabu_extract": ("app.agents.extractors.tabu.prompt", "extractors/tabu"),
    "agreement": (
        "app.agents.extractors.project_agreement.prompt",
        "extractors/project_agreement",
    ),
    "zero_report": (
        "app.agents.extractors.zero_report.prompt",
        "extractors/zero_report",
    ),
    "credit_committee": (
        "app.agents.extractors.credit_committee.prompt",
        "extractors/credit_committee",
    ),
    "appendix_a": (
        "app.agents.extractors.appendix_a.prompt",
        "extractors/appendix_a",
    ),
    "company_docs": (
        "app.agents.extractors.company_docs.prompt",
        "extractors/company_docs",
    ),
    "signing_protocol": (
        "app.agents.extractors.signing_protocol.prompt",
        "extractors/signing_protocol",
    ),
    "planning_permit": (
        "app.agents.extractors.planning_permit.prompt",
        "extractors/planning_permit",
    ),
    "pledges_registry": (
        "app.agents.extractors.pledges_registry.prompt",
        "extractors/pledges_registry",
    ),
    "finance_reconciliation_logic": ("app.agents.synthesis.prompt", "synthesis"),
}
_AGENTS_DIR = Path(__file__).resolve().parent.parent / "agents"

AGENT_PROMPT_FILES: dict[str, dict[str, str]] = {
    "real_estate.project_finance": {
        "tabu_extract": "נסח טאבו",
        "agreement": "הסכם פרויקט",
        "zero_report": "דו״ח אפס",
        "credit_committee": "ועדת אשראי",
        "appendix_a": "נספח א'",
        "company_docs": "מסמכי חברה",
        "signing_protocol": "פרוטוקול מורשה חתימה",
        "planning_permit": "היתר בניה / החלטת ועדה",
        "pledges_registry": "רשם המשכונות",
        "finance_reconciliation_logic": "סינתזה — חתם בכיר",
    },
}


class AiPromptsResponse(BaseModel):
    prompts: dict[str, str]


class AiPromptsUpdateRequest(BaseModel):
    prompts: dict[str, str] = Field(default_factory=dict)


class DefaultPromptResponse(BaseModel):
    prompt: str


class AgentPromptEntry(BaseModel):
    file_key: str
    label_he: str
    content: str


class AgentPromptsListResponse(BaseModel):
    transaction_type: str
    prompts: list[AgentPromptEntry]


class AgentPromptUpdateRequest(BaseModel):
    content: str


class AgentPromptUpdateResponse(BaseModel):
    file_key: str
    content: str


# ── Legacy deal-type prompt endpoints ────────────────────────────────────


@router.get("/ai-prompts", response_model=AiPromptsResponse)
def read_ai_prompts(_: CurrentUser = Depends(get_approved_user)):
    prompts = get_ai_prompts()
    for key in ALLOWED_PROMPT_KEYS:
        prompts.setdefault(key, "")
    return AiPromptsResponse(prompts=prompts)


@router.put("/ai-prompts", response_model=AiPromptsResponse)
def update_ai_prompts(
    body: AiPromptsUpdateRequest,
    _: CurrentUser = Depends(get_approved_user),
):
    stored = put_ai_prompts(body.prompts)
    for key in ALLOWED_PROMPT_KEYS:
        stored.setdefault(key, "")
    return AiPromptsResponse(prompts=stored)


# ── Agent prompt file endpoints ──────────────────────────────────────────


@router.get(
    "/agent-prompts/{transaction_type}",
    response_model=AgentPromptsListResponse,
)
def list_agent_prompts(
    transaction_type: str,
    _: CurrentUser = Depends(get_approved_user),
):
    """Return all agent prompts for a given transaction type (from prompt.py)."""
    mapping = AGENT_PROMPT_FILES.get(transaction_type)
    if mapping is None:
        raise HTTPException(404, f"Unknown transaction type: {transaction_type}")

    import importlib

    entries: list[AgentPromptEntry] = []
    for file_key, label_he in mapping.items():
        mod_spec = _AGENT_PROMPT_MODULES.get(file_key)
        if not mod_spec:
            entries.append(
                AgentPromptEntry(file_key=file_key, label_he=label_he, content="")
            )
            continue
        mod_path, _ = mod_spec
        try:
            mod = importlib.import_module(mod_path)
            get_prompt = getattr(mod, "get_prompt", None)
            content = get_prompt() if get_prompt else getattr(mod, "PROMPT", "")
        except Exception as exc:
            logger.warning("Failed to load prompt for %s: %s", file_key, exc)
            content = ""
        entries.append(
            AgentPromptEntry(file_key=file_key, label_he=label_he, content=content)
        )

    return AgentPromptsListResponse(transaction_type=transaction_type, prompts=entries)


@router.put(
    "/agent-prompts/{transaction_type}/{file_key}",
    response_model=AgentPromptUpdateResponse,
)
def update_agent_prompt(
    transaction_type: str,
    file_key: str,
    body: AgentPromptUpdateRequest,
    _: CurrentUser = Depends(get_approved_user),
):
    """Write updated content to prompt_override.md in the agent folder.

    Next GET or agent run will use this override. Invalidates cache.
    """
    mapping = AGENT_PROMPT_FILES.get(transaction_type)
    if mapping is None:
        raise HTTPException(404, f"Unknown transaction type: {transaction_type}")
    if file_key not in mapping:
        raise HTTPException(404, f"Unknown file key: {file_key}")

    mod_spec = _AGENT_PROMPT_MODULES.get(file_key)
    if not mod_spec:
        raise HTTPException(404, f"No prompt module for: {file_key}")

    _mod_path, folder_rel = mod_spec
    override_path = _AGENTS_DIR / folder_rel / "prompt_override.md"
    override_path.parent.mkdir(parents=True, exist_ok=True)
    override_path.write_text(body.content, encoding="utf-8")
    logger.info(
        "Updated agent prompt override %s/%s (%d chars)",
        transaction_type,
        file_key,
        len(body.content),
    )

    _invalidate_prompt_cache(file_key)

    return AgentPromptUpdateResponse(file_key=file_key, content=body.content)


def _invalidate_prompt_cache(file_key: str) -> None:
    """Clear the lru_cache for the affected agent's _load_instruction."""
    _module_map: dict[str, str] = {
        "tabu_extract": "app.agents.extractors.tabu.agent",
        "agreement": "app.agents.extractors.project_agreement.agent",
        "zero_report": "app.agents.extractors.zero_report.agent",
        "credit_committee": "app.agents.extractors.credit_committee.agent",
        "appendix_a": "app.agents.extractors.appendix_a.agent",
        "company_docs": "app.agents.extractors.company_docs.agent",
        "signing_protocol": "app.agents.extractors.signing_protocol.agent",
        "planning_permit": "app.agents.extractors.planning_permit.agent",
        "pledges_registry": "app.agents.extractors.pledges_registry.agent",
        "finance_reconciliation_logic": "app.agents.synthesis.agent",
    }
    module_name = _module_map.get(file_key)
    if not module_name:
        return
    try:
        import importlib

        mod = importlib.import_module(module_name)
        if file_key == "finance_reconciliation_logic":
            fn = getattr(mod, "_load_business_logic", None)
        else:
            fn = getattr(mod, "_load_instruction", None)
        if fn and hasattr(fn, "cache_clear"):
            fn.cache_clear()
            logger.info("Cleared prompt cache for %s", module_name)
    except Exception as exc:
        logger.warning("Failed to clear prompt cache for %s: %s", module_name, exc)


# ---------------------------------------------------------------------------
# Agent schema endpoints
# ---------------------------------------------------------------------------


@router.get("/agent-schema/{file_key}")
def read_agent_schema(file_key: str, _: CurrentUser = Depends(get_approved_user)):
    """Return the Pydantic JSON schema for a given agent output model."""
    _SCHEMA_MAP: dict[str, tuple[str, str]] = {
        "tabu_extract": ("app.agents.extractors.tabu.schema", "TabuExtraction"),
        "agreement": (
            "app.agents.extractors.project_agreement.schema",
            "AgreementExtraction",
        ),
        "zero_report": (
            "app.agents.extractors.zero_report.schema",
            "ZeroReportExtraction",
        ),
        "credit_committee": (
            "app.agents.extractors.credit_committee.schema",
            "CreditCommitteeExtraction",
        ),
        "appendix_a": (
            "app.agents.extractors.appendix_a.schema",
            "AppendixAExtraction",
        ),
        "company_docs": (
            "app.agents.extractors.company_docs.schema",
            "CompanyDocsExtraction",
        ),
        "signing_protocol": (
            "app.agents.extractors.signing_protocol.schema",
            "SigningProtocolExtraction",
        ),
        "planning_permit": (
            "app.agents.extractors.planning_permit.schema",
            "PlanningPermitExtraction",
        ),
        "pledges_registry": (
            "app.agents.extractors.pledges_registry.schema",
            "PledgesRegistryExtraction",
        ),
        "finance_reconciliation_logic": (
            "app.agents.schemas",
            "RealEstateFinanceDDReport",
        ),
    }

    mapping = _SCHEMA_MAP.get(file_key)
    if mapping is None:
        raise HTTPException(404, f"Unknown schema key: {file_key}")

    module_path, class_name = mapping
    try:
        import importlib

        mod = importlib.import_module(module_path)
        model_cls = getattr(mod, class_name)
        # Pydantic v1/v2 compatibility: prefer model_json_schema if available
        if hasattr(model_cls, "model_json_schema"):
            schema = model_cls.model_json_schema()
        else:
            # fallback to schema()
            schema = model_cls.schema()
    except Exception as exc:
        logger.exception("Failed to load schema for %s: %s", file_key, exc)
        raise HTTPException(500, "Failed to load schema")

    # If there is an overrides file, merge it (simple replacement)
    overrides_dir = (
        Path(__file__).resolve().parent.parent / "agents" / "schemas_overrides"
    )
    overrides_path = overrides_dir / f"{file_key}.json"
    if overrides_path.exists():
        try:
            overrides = json.loads(overrides_path.read_text(encoding="utf-8"))
            # naive: attach under 'x_overrides'
            schema.setdefault("x_overrides", overrides)
        except Exception:
            logger.exception("Failed reading overrides for %s", file_key)

    return {"file_key": file_key, "schema": schema}


@router.put("/agent-schema/{file_key}")
def update_agent_schema(
    file_key: str,
    body: dict,
    _: CurrentUser = Depends(get_approved_user),
):
    """Persist an overrides JSON for the agent schema (editable metadata)."""
    # validate key
    allowed = {
        "tabu_extract",
        "agreement",
        "zero_report",
        "credit_committee",
        "appendix_a",
        "company_docs",
        "signing_protocol",
        "planning_permit",
        "pledges_registry",
        "finance_reconciliation_logic",
    }
    if file_key not in allowed:
        raise HTTPException(404, f"Unknown schema key: {file_key}")

    overrides_dir = (
        Path(__file__).resolve().parent.parent / "agents" / "schemas_overrides"
    )
    overrides_dir.mkdir(parents=True, exist_ok=True)
    target = overrides_dir / f"{file_key}.json"
    try:
        target.write_text(
            json.dumps(body, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except Exception as exc:
        logger.exception("Failed writing schema override for %s: %s", file_key, exc)
        raise HTTPException(500, "Failed to write override")

    return {"file_key": file_key, "overrides": body}


@router.get("/agent-pydantic/{file_key}")
def read_agent_pydantic(file_key: str, _: CurrentUser = Depends(get_approved_user)):
    """Return the Pydantic model source code for a given agent output model."""
    _SCHEMA_MAP: dict[str, tuple[str, str]] = {
        "tabu_extract": ("app.agents.extractors.tabu.schema", "TabuExtraction"),
        "agreement": (
            "app.agents.extractors.project_agreement.schema",
            "AgreementExtraction",
        ),
        "zero_report": (
            "app.agents.extractors.zero_report.schema",
            "ZeroReportExtraction",
        ),
        "credit_committee": (
            "app.agents.extractors.credit_committee.schema",
            "CreditCommitteeExtraction",
        ),
        "appendix_a": (
            "app.agents.extractors.appendix_a.schema",
            "AppendixAExtraction",
        ),
        "company_docs": (
            "app.agents.extractors.company_docs.schema",
            "CompanyDocsExtraction",
        ),
        "signing_protocol": (
            "app.agents.extractors.signing_protocol.schema",
            "SigningProtocolExtraction",
        ),
        "planning_permit": (
            "app.agents.extractors.planning_permit.schema",
            "PlanningPermitExtraction",
        ),
        "pledges_registry": (
            "app.agents.extractors.pledges_registry.schema",
            "PledgesRegistryExtraction",
        ),
        "finance_reconciliation_logic": (
            "app.agents.schemas",
            "RealEstateFinanceDDReport",
        ),
    }

    mapping = _SCHEMA_MAP.get(file_key)
    if mapping is None:
        raise HTTPException(404, f"Unknown schema key: {file_key}")

    module_path, class_name = mapping
    try:
        import importlib, inspect

        mod = importlib.import_module(module_path)
        model_cls = getattr(mod, class_name)
        source = inspect.getsource(model_cls)
    except Exception as exc:
        logger.exception("Failed to load pydantic source for %s: %s", file_key, exc)
        raise HTTPException(500, "Failed to load pydantic source")

    return {"file_key": file_key, "pydantic_source": source}
