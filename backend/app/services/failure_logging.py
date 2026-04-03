"""Log analysis failures at ERROR level for GCP (e.g. log-based alerts)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Prefix so you can filter in Logs Explorer: severity=ERROR AND textPayload:"[D-Done] DD analysis failed"
_DD_ANALYSIS_FAILED_PREFIX = "[D-Done] DD analysis failed"


def log_analysis_failure(
    *,
    project_id: str,
    check_id: str,
    user_email: str,
    error_message: str,
    project_title: str | None = None,
    traceback_str: str | None = None,
) -> None:
    """Log analysis failure at ERROR with full context (no notification; logging only)."""
    utc_now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    project_display = project_title or project_id

    message = f"""D-Done Due Diligence Analysis Failure

Project
  ID:    {project_id}
  Title: {project_display}

Check
  Check ID: {check_id}

User
  Email: {user_email}

Error
{error_message}
"""

    if traceback_str:
        message += f"""
Traceback
{traceback_str}
"""

    message += f"""
Time (UTC): {utc_now}
"""

    logger.error(
        "%s — project_id=%s check_id=%s user=%s\n%s",
        _DD_ANALYSIS_FAILED_PREFIX,
        project_id,
        check_id,
        user_email,
        message,
    )
