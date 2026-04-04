"""NpmGuard domain models."""

from enum import StrEnum

from pydantic import BaseModel

__all__ = [
    "AttackPathway",
    "AuditReport",
    "CapabilityEnum",
    "Proof",
    "ProofKind",
    "ResolvedPackage",
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

    # Supply-chain propagation
    WORM_PROPAGATION = "WORM_PROPAGATION"   # self-propagating npm publish
    CLIPBOARD_HIJACK = "CLIPBOARD_HIJACK"   # crypto address replacement in clipboard
    TELEMETRY_RAT = "TELEMETRY_RAT"         # RAT disguised as telemetry/analytics
    BUILD_PLUGIN_EXFIL = "BUILD_PLUGIN_EXFIL"  # CI/CD credential theft via build tool
    NPM_TOKEN_ABUSE = "NPM_TOKEN_ABUSE"     # reads/uses .npmrc tokens to publish


class ProofKind(StrEnum):
    """Classification of how a proof was generated."""

    STATIC_REGEX = "STATIC_REGEX"       # regex match in source
    STATIC_AST = "STATIC_AST"           # AST pattern match
    STATIC_LLM = "STATIC_LLM"          # LLM-confirmed finding
    DYNAMIC_SANDBOX = "DYNAMIC_SANDBOX" # sandbox test passed
    DYNAMIC_NETWORK = "DYNAMIC_NETWORK" # observed network call
    DYNAMIC_FS = "DYNAMIC_FS"           # observed filesystem op
    BEHAVIORAL = "BEHAVIORAL"           # runtime behavior (timing, loops)


class AttackPathway(StrEnum):
    """Identifiers for the top 10 real-world npm attack patterns."""

    DEP_INJECT_ENCRYPTED = "DEP_INJECT_ENCRYPTED"     # event-stream (2018)
    LIFECYCLE_BINARY_DROP = "LIFECYCLE_BINARY_DROP"    # ua-parser-js / coa / rc (2021)
    MAINTAINER_SABOTAGE = "MAINTAINER_SABOTAGE"       # colors.js / faker.js (2022)
    GEO_GATED_WIPER = "GEO_GATED_WIPER"              # node-ipc (2022)
    WORM_PROPAGATION = "WORM_PROPAGATION"             # Shai-Hulud (2025)
    ACCOUNT_TAKEOVER_CRYPTO = "ACCOUNT_TAKEOVER_CRYPTO"  # Qix/chalk (2025)
    CDN_DOM_DRAINER = "CDN_DOM_DRAINER"               # Ledger connect-kit (2023)
    MULTI_STAGE_DNS = "MULTI_STAGE_DNS"               # SANDWORM_MODE (2025)
    TELEMETRY_RAT = "TELEMETRY_RAT"                   # Axios RAT (2026)
    BUILD_PLUGIN_EXFIL = "BUILD_PLUGIN_EXFIL"         # s1ngularity / Nx (2025)


class Proof(BaseModel):
    file_line: str  # e.g., "src/index.js:42" or "package.json:scripts.preinstall"
    problem: str  # Contextual string detailing what was found
    proof_data: str  # Concrete evidence
    # Verifiable proof fields
    kind: ProofKind = ProofKind.STATIC_REGEX
    content_hash: str | None = None      # SHA-256 of the source file at detection time
    attack_pathway: str | None = None    # e.g. "LIFECYCLE_BINARY_DROP"
    reproducible: bool = False           # can this proof be re-verified?
    reproduction_cmd: str | None = None  # command to re-verify (for dynamic proofs)


class ResolvedPackage(BaseModel):
    """Result of resolving a package name to a local directory."""

    path: str
    needs_cleanup: bool = False
    tmpdir: str | None = None


class AuditReport(BaseModel):
    verdict: VerdictEnum
    capabilities: list[CapabilityEnum]
    proofs: list[Proof]
