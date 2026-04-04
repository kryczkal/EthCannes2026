"""Phase 0 — Package Inventory.

Structural triage: classify files, parse metadata, run fast deterministic
checks.  No JS content analysis, no execution, no LLM.
"""

from __future__ import annotations

import json
import os
from typing import Any

import structlog
from temporalio import activity

from npmguard.inventory.checks import run_inventory_checks
from npmguard.inventory.classify import classify_files
from npmguard.inventory.models import InventoryReport
from npmguard.inventory.parse_manifest import parse_package_json

__all__ = ["InventoryReport", "analyze_inventory"]

log = structlog.get_logger()


def _read_package_json(package_path: str) -> dict[str, Any]:
    pkg_json_path = os.path.join(package_path, "package.json")
    if not os.path.isfile(pkg_json_path):
        log.warning("inventory.missing_package_json", path=pkg_json_path)
        return {}
    try:
        with open(pkg_json_path, encoding="utf-8") as f:
            data: dict[str, Any] = json.load(f)
            return data
    except (json.JSONDecodeError, OSError) as exc:
        log.warning("inventory.bad_package_json", path=pkg_json_path, error=str(exc))
        return {}


@activity.defn
async def analyze_inventory(package_path: str) -> InventoryReport:
    """Phase 0: Inventory a package's structure and run fast structural checks."""
    pkg_json = _read_package_json(package_path)
    metadata, scripts, entry_points, deps = parse_package_json(pkg_json)

    files = classify_files(package_path)
    flags, dealbreaker = run_inventory_checks(scripts, entry_points, files, package_path)

    log.info(
        "inventory.done",
        package=metadata.name,
        files=len(files),
        flags=len(flags),
        dealbreaker=dealbreaker is not None,
    )

    return InventoryReport(
        metadata=metadata,
        scripts=scripts,
        entry_points=entry_points,
        dependencies=deps,
        files=files,
        flags=flags,
        dealbreaker=dealbreaker,
    )
