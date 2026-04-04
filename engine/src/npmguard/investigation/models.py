"""Data models for the agentic investigation phase."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum

from pydantic import BaseModel, Field


class Confidence(StrEnum):
    """How confident is the finding."""

    SUSPECTED = "SUSPECTED"  # code looks suspicious but not confirmed
    LIKELY = "LIKELY"  # multiple signals corroborate
    CONFIRMED = "CONFIRMED"  # observed in sandbox execution


class InvestigationInput(BaseModel):
    """Temporal activity input for Phase 1b."""

    package_path: str
    package_name: str = ""
    version: str = ""
    description: str = ""
    flags: list[str] = Field(default_factory=list)
    static_caps: list[str] = Field(default_factory=list)
    static_proof_summaries: list[str] = Field(default_factory=list)


class Finding(BaseModel):
    """A single finding produced by the investigation agent."""

    capability: str = Field(description="CapabilityEnum value, e.g. 'NETWORK'")
    confidence: Confidence = Field(description="SUSPECTED, LIKELY, or CONFIRMED")
    file_line: str = Field(description="e.g. 'lib/index.js:42-67'")
    problem: str = Field(description="Human-readable description of the threat")
    evidence: str = Field(description="Concrete data or observation from the investigation")
    reproduction_strategy: str = Field(
        default="",
        description="How to prove this finding in a reproducible test",
    )


class InvestigationOutput(BaseModel):
    """Structured output from the investigation agent."""

    findings: list[Finding] = Field(default_factory=list)
    summary: str = Field(default="", description="High-level summary of the investigation")


class ToolCallRecord(BaseModel):
    """Audit trail entry for each tool call the agent made."""

    tool: str
    args: dict
    result_preview: str = ""  # first 500 chars
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    injection_detected: bool = False
