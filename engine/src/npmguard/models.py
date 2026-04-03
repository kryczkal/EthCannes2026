from enum import Enum
from typing import List

from pydantic import BaseModel


class VerdictEnum(str, Enum):
    SAFE = "SAFE"
    DANGEROUS = "DANGEROUS"


class CapabilityEnum(str, Enum):
    NETWORK = "NETWORK"
    FILESYSTEM = "FILESYSTEM"
    PROCESS_SPAWN = "PROCESS_SPAWN"
    ENV_VARS = "ENV_VARS"
    EVAL = "EVAL"
    # To be expanded...


class Proof(BaseModel):
    file_line: str        # e.g., "src/index.js:42" or "package.json:scripts.preinstall"
    problem: str          # Contextual string detailing what was found
    proof_data: str       # Concrete evidence


class AuditReport(BaseModel):
    verdict: VerdictEnum
    capabilities: List[CapabilityEnum]
    proofs: List[Proof]
