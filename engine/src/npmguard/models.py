"""NpmGuard domain models."""

from enum import StrEnum

from pydantic import BaseModel

__all__ = [
    "AuditReport",
    "CapabilityEnum",
    "Proof",
    "VerdictEnum",
]


class VerdictEnum(StrEnum):
    SAFE = "SAFE"
    DANGEROUS = "DANGEROUS"


class CapabilityEnum(StrEnum):
    NETWORK = "NETWORK"
    FILESYSTEM = "FILESYSTEM"
    PROCESS_SPAWN = "PROCESS_SPAWN"
    ENV_VARS = "ENV_VARS"
    EVAL = "EVAL"
    # To be expanded...


class Proof(BaseModel):
    file_line: str  # e.g., "src/index.js:42" or "package.json:scripts.preinstall"
    problem: str  # Contextual string detailing what was found
    proof_data: str  # Concrete evidence


class AuditReport(BaseModel):
    verdict: VerdictEnum
    capabilities: list[CapabilityEnum]
    proofs: list[Proof]
