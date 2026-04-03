"""Base types for the pluggable check system."""

from __future__ import annotations

import json
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import structlog

from npmguard.models import CapabilityEnum, Proof  # noqa: TC001

log = structlog.get_logger()

MAX_FILE_SIZE = 100_000  # 100 KB per file
SCANNABLE_EXTENSIONS = frozenset((".js", ".mjs", ".cjs", ".json", ".ts", ".mts"))
_SKIP_DIRS = frozenset(("node_modules", ".git", ".svn"))


@dataclass(frozen=True)
class CheckResult:
    """Result returned by a single check."""

    capabilities: list[CapabilityEnum] = field(default_factory=list)
    proofs: list[Proof] = field(default_factory=list)
    short_circuit: bool = False


@dataclass(frozen=True)
class PackageContext:
    """Read-only context built once and shared by every check."""

    package_path: str
    package_json: dict[str, Any]
    package_name: str
    version: str
    description: str
    lifecycle_hooks: dict[str, str]
    files: dict[str, str]  # rel_path → content
    file_list: list[str]  # all relative paths


class BaseCheck(ABC):
    """Abstract base for all analysis checks."""

    name: str
    tier: int  # 0 = gate (runs first, can short-circuit), 1 = normal

    @abstractmethod
    async def run(self, ctx: PackageContext) -> CheckResult: ...


LIFECYCLE_HOOK_KEYS = frozenset(("preinstall", "postinstall", "install", "prepare"))


async def build_context(package_path: str) -> PackageContext:
    """Walk *package_path*, read scannable files, and return a PackageContext."""
    pkg_json_path = os.path.join(package_path, "package.json")
    package_json: dict[str, Any] = {}
    if os.path.isfile(pkg_json_path):
        try:
            with open(pkg_json_path, encoding="utf-8") as f:
                package_json = json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            log.warning("build_context.bad_package_json", path=pkg_json_path, error=str(exc))

    scripts: dict[str, str] = package_json.get("scripts", {})
    lifecycle_hooks = {k: v for k, v in scripts.items() if k in LIFECYCLE_HOOK_KEYS}

    files: dict[str, str] = {}
    file_list: list[str] = []

    for dirpath, dirnames, filenames in os.walk(package_path):
        # Prune skipped dirs in-place so os.walk doesn't descend into them
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS]

        for fname in filenames:
            abs_path = os.path.join(dirpath, fname)
            rel_path = os.path.relpath(abs_path, package_path)
            file_list.append(rel_path)

            _, ext = os.path.splitext(fname)
            if ext not in SCANNABLE_EXTENSIONS:
                continue

            try:
                size = os.path.getsize(abs_path)
                if size > MAX_FILE_SIZE:
                    continue
                with open(abs_path, encoding="utf-8") as f:
                    files[rel_path] = f.read()
            except (OSError, UnicodeDecodeError):
                continue

    return PackageContext(
        package_path=package_path,
        package_json=package_json,
        package_name=package_json.get("name", "unknown"),
        version=package_json.get("version", "0.0.0"),
        description=package_json.get("description", ""),
        lifecycle_hooks=lifecycle_hooks,
        files=files,
        file_list=file_list,
    )
