"""Pytest configuration for the eval tests.

Adds the backend directory to ``sys.path`` so that ``app.*`` imports work
when pytest is invoked from the workspace root or the backend directory.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure ``backend/`` is on the path so ``app.*`` and ``eval.*`` resolve.
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
