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
    # Network / exfiltration
    NETWORK = "NETWORK"
    DNS_EXFIL = "DNS_EXFIL"           # encodes data into DNS queries
    DOM_INJECT = "DOM_INJECT"         # injects scripts/iframes into the DOM

    # Filesystem / OS
    FILESYSTEM = "FILESYSTEM"
    BINARY_DOWNLOAD = "BINARY_DOWNLOAD"   # downloads & executes a binary
    PROCESS_SPAWN = "PROCESS_SPAWN"

    # Credential & environment theft
    ENV_VARS = "ENV_VARS"             # reads process.env for secrets
    CREDENTIAL_THEFT = "CREDENTIAL_THEFT"  # reads ~/.npmrc, ~/.aws, ~/.ssh etc.

    # Code execution tricks
    EVAL = "EVAL"                     # eval() / Function() / vm.runInNewContext()
    OBFUSCATION = "OBFUSCATION"       # reversed strings, XOR/base64 self-decoding
    ENCRYPTED_PAYLOAD = "ENCRYPTED_PAYLOAD"  # AES/cipher-encrypted second stage

    # Availability
    DOS_LOOP = "DOS_LOOP"             # infinite loop on require / blocking spin

    # Anti-analysis
    ANTI_AI_PROMPT = "ANTI_AI_PROMPT"  # embedded text trying to hijack LLM analysis
    GEO_GATING = "GEO_GATING"        # activates only in certain geolocations

    # Lifecycle abuse
    LIFECYCLE_HOOK = "LIFECYCLE_HOOK"  # malicious preinstall/postinstall script


class Proof(BaseModel):
    file_line: str  # e.g., "src/index.js:42" or "package.json:scripts.preinstall"
    problem: str  # Contextual string detailing what was found
    proof_data: str  # Concrete evidence


class AuditReport(BaseModel):
    verdict: VerdictEnum
    capabilities: list[CapabilityEnum]
    proofs: list[Proof]
