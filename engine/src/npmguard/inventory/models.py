"""Phase 0 inventory models."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel


class Severity(StrEnum):
    INFO = "info"
    WARN = "warn"
    CRITICAL = "critical"


class InventoryFlag(BaseModel):
    """A structural finding from Phase 0 triage."""

    severity: Severity
    check: str
    detail: str
    file: str | None = None


class DealBreaker(BaseModel):
    """An immediate pipeline-stopping finding."""

    check: str
    detail: str


class FileRecord(BaseModel):
    """Classification of a single file in the package."""

    path: str
    file_type: str
    size_bytes: int
    permissions: str
    is_binary: bool
    binary_type: str | None = None


class EntryPoints(BaseModel):
    """Derived entry points from package.json."""

    install: list[str]
    runtime: list[str]
    bin: list[str]


class PackageMetadata(BaseModel):
    """Extracted metadata from package.json."""

    name: str | None = None
    version: str | None = None
    description: str | None = None
    license: str | None = None
    homepage: str | None = None
    repository: str | dict[str, Any] | None = None


class InventoryReport(BaseModel):
    """Complete Phase 0 output."""

    metadata: PackageMetadata
    scripts: dict[str, str]
    entry_points: EntryPoints
    dependencies: dict[str, dict[str, str]]
    files: list[FileRecord]
    flags: list[InventoryFlag]
    dealbreaker: DealBreaker | None = None
