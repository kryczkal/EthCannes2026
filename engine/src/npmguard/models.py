"""NpmGuard v2 domain models.

Defines the core types for the AI-agentic security analysis pipeline:
  Phase 0  — Inventory (see inventory/models.py)
  Phase 1a — Triage (TriageResult, FocusArea)
  Phase 1b — Investigation (Finding, InstrumentationLog)
  Phase 1c — Test generation (test_file/test_hash on Proof)
  Phase 2  — Proof verification (Proof, AuditReport)
"""

from enum import StrEnum

from pydantic import BaseModel, Field

__all__ = [
    # Enums
    "AttackPathway",
    "CapabilityEnum",
    "Confidence",
    "ProofKind",
    "VerdictEnum",
    # Phase 1a
    "FocusArea",
    "TriageResult",
    # Phase 1b
    "CryptoOp",
    "EvalCall",
    "Finding",
    "FsOperation",
    "InstrumentationLog",
    "NetworkCall",
    "ProcessSpawn",
    "TimerRecord",
    # Proof & report
    "AuditReport",
    "Proof",
    # Package identity
    "ResolvedPackage",
]


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


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


class Confidence(StrEnum):
    """Escalation levels for finding certainty."""

    SUSPECTED = "SUSPECTED"   # regex signal or LLM suspicion
    LIKELY = "LIKELY"         # multiple corroborating signals
    CONFIRMED = "CONFIRMED"   # sandbox execution or passing test


class ProofKind(StrEnum):
    """How a proof was generated — determines verification strategy."""

    STRUCTURAL = "STRUCTURAL"             # regex/structural check (unevadable)
    AI_STATIC = "AI_STATIC"               # LLM found by reading code
    AI_DYNAMIC = "AI_DYNAMIC"             # LLM confirmed via sandbox execution
    TEST_CONFIRMED = "TEST_CONFIRMED"     # auto-generated vitest passed
    TEST_UNCONFIRMED = "TEST_UNCONFIRMED" # vitest generated but failed


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


# ---------------------------------------------------------------------------
# Phase 1a: Triage
# ---------------------------------------------------------------------------


class FocusArea(BaseModel):
    """A region of code the triage LLM wants the investigation agent to examine."""

    file: str                     # e.g. "lib/loader.js"
    lines: str | None = None      # e.g. "42-80" (string — LLM output, not parsed)
    reason: str                   # e.g. "obfuscated string concatenation building a URL"


class TriageResult(BaseModel):
    """Phase 1a output — cheap risk assessment to filter benign packages."""

    risk_score: int = Field(ge=0, le=10)
    risk_summary: str
    focus_areas: list[FocusArea] = []


# ---------------------------------------------------------------------------
# Phase 1b: Investigation
# ---------------------------------------------------------------------------


class Finding(BaseModel):
    """An intermediate discovery by the investigation agent (before proof verification)."""

    capability: CapabilityEnum
    attack_pathway: AttackPathway | str   # known enum or "NOVEL"
    confidence: Confidence
    file: str
    lines: str | None = None
    evidence: str
    reasoning: str                        # agent chain-of-thought
    reproduction_strategy: str            # how to prove this in a test


# --- Instrumentation sub-models (structured sandbox telemetry) ---


class NetworkCall(BaseModel):
    method: str
    url: str
    body_preview: str = ""


class FsOperation(BaseModel):
    op: str                # "read", "write", "access", "stat"
    path: str
    preview: str = ""


class ProcessSpawn(BaseModel):
    cmd: str
    args: list[str] = []


class EvalCall(BaseModel):
    code: str              # truncated to safe length


class CryptoOp(BaseModel):
    method: str            # e.g. "createDecipheriv"
    algo: str              # e.g. "aes-256-cbc"


class TimerRecord(BaseModel):
    type: str              # "setTimeout" or "setInterval"
    ms: int
    source: str = ""       # e.g. "lib/beacon.js:15"


class InstrumentationLog(BaseModel):
    """Structured output from the Docker sandbox instrumentation module."""

    modules_loaded: list[str] = []
    network_calls: list[NetworkCall] = []
    fs_operations: list[FsOperation] = []
    env_access: list[str] = []
    process_spawns: list[ProcessSpawn] = []
    eval_calls: list[EvalCall] = []
    crypto_ops: list[CryptoOp] = []
    timers: list[TimerRecord] = []


# ---------------------------------------------------------------------------
# Proof & Report
# ---------------------------------------------------------------------------


class Proof(BaseModel):
    """A verifiable piece of evidence that a package exhibits a capability.

    Every proof binds a specific capability to a specific location in the code,
    with classification, integrity, and reproducibility metadata.
    """

    # What was found
    capability: CapabilityEnum            # REQUIRED — no default
    attack_pathway: AttackPathway | str = ""  # empty = unclassified
    confidence: Confidence = Confidence.SUSPECTED

    # Where in the code
    file_line: str                        # e.g. "lib/loader.js:42-67"
    problem: str                          # human-readable description
    evidence: str                         # concrete data (was proof_data in v1)

    # Classification
    kind: ProofKind = ProofKind.STRUCTURAL

    # Integrity
    content_hash: str | None = None       # SHA-256 of source file at detection time

    # Reproducibility
    reproducible: bool = False
    reproduction_cmd: str | None = None   # command to re-verify

    # Test artifacts (Phase 1c)
    test_file: str | None = None          # path to auto-generated test
    test_hash: str | None = None          # SHA-256 of test file

    # AI provenance (Phase 2)
    reasoning_hash: str | None = None     # SHA-256 of agent reasoning trace
    tee_attestation_id: str | None = None # 0G Compute attestation ID


class AuditReport(BaseModel):
    """Final pipeline output — verdict with verifiable proof chain."""

    verdict: VerdictEnum
    capabilities: list[CapabilityEnum] = []
    proofs: list[Proof] = []

    # v2: intermediate results for observability / debugging
    triage: TriageResult | None = None
    findings: list[Finding] = []


# ---------------------------------------------------------------------------
# Package identity
# ---------------------------------------------------------------------------


class ResolvedPackage(BaseModel):
    """Result of resolving a package name to a local directory."""

    path: str
    needs_cleanup: bool = False
    tmpdir: str | None = None
