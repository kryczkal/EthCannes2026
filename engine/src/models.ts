import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const VerdictEnum = z.enum(["SAFE", "DANGEROUS"]);
export type VerdictEnum = z.infer<typeof VerdictEnum>;

export const CapabilityEnum = z.enum([
  // Network / exfiltration
  "NETWORK",
  "DNS_EXFIL",
  "DOM_INJECT",
  // Filesystem / OS
  "FILESYSTEM",
  "BINARY_DOWNLOAD",
  "PROCESS_SPAWN",
  // Credential & environment theft
  "ENV_VARS",
  "CREDENTIAL_THEFT",
  // Code execution tricks
  "EVAL",
  "OBFUSCATION",
  "ENCRYPTED_PAYLOAD",
  // Availability
  "DOS_LOOP",
  // Anti-analysis
  "ANTI_AI_PROMPT",
  "GEO_GATING",
  // Lifecycle abuse
  "LIFECYCLE_HOOK",
  // Supply-chain propagation
  "WORM_PROPAGATION",
  "CLIPBOARD_HIJACK",
  "TELEMETRY_RAT",
  "BUILD_PLUGIN_EXFIL",
  "NPM_TOKEN_ABUSE",
]);
export type CapabilityEnum = z.infer<typeof CapabilityEnum>;

export const Confidence = z.enum(["SUSPECTED", "LIKELY", "CONFIRMED"]);
export type Confidence = z.infer<typeof Confidence>;

export const ProofKind = z.enum([
  "STRUCTURAL",
  "AI_STATIC",
  "AI_DYNAMIC",
  "TEST_CONFIRMED",
  "TEST_UNCONFIRMED",
]);
export type ProofKind = z.infer<typeof ProofKind>;

export const AttackPathway = z.enum([
  "DEP_INJECT_ENCRYPTED",
  "LIFECYCLE_BINARY_DROP",
  "MAINTAINER_SABOTAGE",
  "GEO_GATED_WIPER",
  "WORM_PROPAGATION",
  "ACCOUNT_TAKEOVER_CRYPTO",
  "CDN_DOM_DRAINER",
  "MULTI_STAGE_DNS",
  "TELEMETRY_RAT",
  "BUILD_PLUGIN_EXFIL",
]);
export type AttackPathway = z.infer<typeof AttackPathway>;

// ---------------------------------------------------------------------------
// Phase 1a: Triage
// ---------------------------------------------------------------------------

export const FocusArea = z.object({
  file: z.string(),
  lines: z.string().nullable().default(null),
  reason: z.string(),
});
export type FocusArea = z.infer<typeof FocusArea>;

export const TriageResult = z.object({
  riskScore: z.number().int().min(0).max(10),
  riskSummary: z.string(),
  focusAreas: z.array(FocusArea).default([]),
});
export type TriageResult = z.infer<typeof TriageResult>;

export const FileVerdict = z.object({
  file: z.string(),
  capabilities: z.array(z.string()).default([]),
  suspiciousPatterns: z.array(z.string()).default([]),
  suspiciousLines: z.string().nullable().default(null),
  summary: z.string(),
  riskContribution: z.number().int().min(0).max(10),
});
export type FileVerdict = z.infer<typeof FileVerdict>;

// ---------------------------------------------------------------------------
// Phase 1b: Investigation
// ---------------------------------------------------------------------------

export const Finding = z.object({
  capability: z.string().describe("CapabilityEnum value, e.g. 'NETWORK'"),
  confidence: Confidence,
  fileLine: z.string().describe("e.g. 'lib/index.js:42-67'"),
  problem: z.string().describe("Human-readable description of the threat"),
  evidence: z.string().describe("Concrete data or observation"),
  reproductionStrategy: z.string().default("").describe("How to prove this in a reproducible test"),
});
export type Finding = z.infer<typeof Finding>;

export const InvestigationInput = z.object({
  packagePath: z.string(),
  packageName: z.string().default(""),
  version: z.string().default(""),
  description: z.string().default(""),
  flags: z.array(z.string()).default([]),
  staticCaps: z.array(z.string()).default([]),
  staticProofSummaries: z.array(z.string()).default([]),
});
export type InvestigationInput = z.infer<typeof InvestigationInput>;

export const InvestigationOutput = z.object({
  findings: z.array(Finding).default([]),
  summary: z.string().default(""),
});

export type InvestigationOutput = z.infer<typeof InvestigationOutput>;

export const ToolCallRecord = z.object({
  tool: z.string(),
  args: z.record(z.unknown()),
  resultPreview: z.string().default(""),
  timestamp: z.string().default(() => new Date().toISOString()),
  injectionDetected: z.boolean().default(false),
});
export type ToolCallRecord = z.infer<typeof ToolCallRecord>;

/** Extended output from the agent runner — includes tool call trace for observability. */
export const InvestigationAgentOutput = InvestigationOutput.extend({
  toolCalls: z.array(ToolCallRecord).default([]),
  agentText: z.string().default(""),
});
export type InvestigationAgentOutput = z.infer<typeof InvestigationAgentOutput>;

// ---------------------------------------------------------------------------
// Instrumentation sub-models
// ---------------------------------------------------------------------------

export const NetworkCall = z.object({
  method: z.string(),
  url: z.string(),
  bodyPreview: z.string().default(""),
});
export type NetworkCall = z.infer<typeof NetworkCall>;

export const FsOperation = z.object({
  op: z.string(),
  path: z.string(),
  preview: z.string().default(""),
});
export type FsOperation = z.infer<typeof FsOperation>;

export const ProcessSpawn = z.object({
  cmd: z.string(),
  args: z.array(z.string()).default([]),
});
export type ProcessSpawn = z.infer<typeof ProcessSpawn>;

export const EvalCall = z.object({
  code: z.string(),
});
export type EvalCall = z.infer<typeof EvalCall>;

export const CryptoOp = z.object({
  method: z.string(),
  algo: z.string(),
});
export type CryptoOp = z.infer<typeof CryptoOp>;

export const TimerRecord = z.object({
  type: z.string(),
  ms: z.number(),
  source: z.string().default(""),
});
export type TimerRecord = z.infer<typeof TimerRecord>;

export const InstrumentationLog = z.object({
  modulesLoaded: z.array(z.string()).default([]),
  networkCalls: z.array(NetworkCall).default([]),
  fsOperations: z.array(FsOperation).default([]),
  envAccess: z.array(z.string()).default([]),
  processSpawns: z.array(ProcessSpawn).default([]),
  evalCalls: z.array(EvalCall).default([]),
  cryptoOps: z.array(CryptoOp).default([]),
  timers: z.array(TimerRecord).default([]),
});
export type InstrumentationLog = z.infer<typeof InstrumentationLog>;

// ---------------------------------------------------------------------------
// Proof & Report
// ---------------------------------------------------------------------------

export const Proof = z.object({
  capability: CapabilityEnum.nullable().default(null),
  attackPathway: z.string().default(""),
  confidence: Confidence.default("SUSPECTED"),

  fileLine: z.string(),
  problem: z.string(),
  evidence: z.string(),

  kind: ProofKind.default("STRUCTURAL"),
  contentHash: z.string().nullable().default(null),

  reproducible: z.boolean().default(false),
  reproductionCmd: z.string().nullable().default(null),

  testFile: z.string().nullable().default(null),
  testHash: z.string().nullable().default(null),
  testCode: z.string().nullable().default(null),

  reasoningHash: z.string().nullable().default(null),
  teeAttestationId: z.string().nullable().default(null),
});
export type Proof = z.infer<typeof Proof>;

export const PhaseLog = z.object({
  phase: z.string(),
  durationMs: z.number(),
  input: z.record(z.unknown()).default({}),
  output: z.record(z.unknown()).default({}),
});
export type PhaseLog = z.infer<typeof PhaseLog>;

export const AuditReport = z.object({
  verdict: VerdictEnum,
  capabilities: z.array(CapabilityEnum).default([]),
  proofs: z.array(Proof).default([]),
  triage: TriageResult.nullable().default(null),
  findings: z.array(Finding).default([]),
  trace: z.array(PhaseLog).default([]),
});
export type AuditReport = z.infer<typeof AuditReport>;

export const ResolvedPackage = z.object({
  path: z.string(),
  needsCleanup: z.boolean().default(false),
  tmpdir: z.string().nullable().default(null),
});
export type ResolvedPackage = z.infer<typeof ResolvedPackage>;

// ---------------------------------------------------------------------------
// Inventory (Phase 0)
// ---------------------------------------------------------------------------

export const Severity = z.enum(["info", "warn", "critical"]);
export type Severity = z.infer<typeof Severity>;

export const InventoryFlag = z.object({
  severity: Severity,
  check: z.string(),
  detail: z.string(),
  file: z.string().nullable().default(null),
});
export type InventoryFlag = z.infer<typeof InventoryFlag>;

export const DealBreaker = z.object({
  check: z.string(),
  detail: z.string(),
});
export type DealBreaker = z.infer<typeof DealBreaker>;

export const FileRecord = z.object({
  path: z.string(),
  fileType: z.string(),
  sizeBytes: z.number(),
  permissions: z.string(),
  isBinary: z.boolean(),
  binaryType: z.string().nullable().default(null),
});
export type FileRecord = z.infer<typeof FileRecord>;

export const EntryPoints = z.object({
  install: z.array(z.string()),
  runtime: z.array(z.string()),
  bin: z.array(z.string()),
});
export type EntryPoints = z.infer<typeof EntryPoints>;

export const PackageMetadata = z.object({
  name: z.string().nullable().default(null),
  version: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  license: z.string().nullable().default(null),
  homepage: z.string().nullable().default(null),
  repository: z.unknown().default(null),
});
export type PackageMetadata = z.infer<typeof PackageMetadata>;

export const InventoryReport = z.object({
  metadata: PackageMetadata,
  scripts: z.record(z.string()),
  entryPoints: EntryPoints,
  dependencies: z.record(z.record(z.string())),
  files: z.array(FileRecord),
  flags: z.array(InventoryFlag),
  dealbreaker: DealBreaker.nullable().default(null),
});
export type InventoryReport = z.infer<typeof InventoryReport>;
