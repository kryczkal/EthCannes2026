// Mirror of engine event types and data structures

export interface FileRecord {
  path: string;
  fileType: string;
  sizeBytes: number;
  permissions: string;
  isBinary: boolean;
  binaryType: string | null;
}

export interface FileVerdict {
  file: string;
  capabilities: string[];
  suspiciousPatterns: string[];
  suspiciousLines: string | null;
  summary: string;
  riskContribution: number;
}

export interface FocusArea {
  file: string;
  lines: string | null;
  reason: string;
}

export interface Finding {
  capability: string;
  confidence: "SUSPECTED" | "LIKELY" | "CONFIRMED";
  fileLine: string;
  problem: string;
  evidence: string;
  reproductionStrategy: string;
}

export interface Proof {
  capability: string | null;
  attackPathway: string;
  confidence: "SUSPECTED" | "LIKELY" | "CONFIRMED";
  fileLine: string;
  problem: string;
  evidence: string;
  kind: "STRUCTURAL" | "AI_STATIC" | "AI_DYNAMIC" | "TEST_CONFIRMED" | "TEST_UNCONFIRMED";
  reproducible: boolean;
  reproductionCmd: string | null;
  testFile: string | null;
  testHash: string | null;
  testCode: string | null;
  verifyError: string | null;
  reasoningHash: string | null;
}

export type FileStatus = "pending" | "analyzing" | "safe" | "suspicious" | "dangerous";

export type PhaseStatus = "pending" | "active" | "done";

export interface PhaseInfo {
  name: string;
  durationMs?: number;
  status: PhaseStatus;
}

export interface AgentStep {
  type: "tool_call" | "tool_result" | "reasoning";
  tool?: string;
  args?: Record<string, unknown>;
  resultPreview?: string;
  text?: string;
  step: number;
  timestamp: string;
  injectionDetected?: boolean;
}

export interface PipelineLogEntry {
  kind: "phase" | "info" | "file-scan" | "file-flag" | "scripts";
  text: string;
  file?: string;
  risk?: number;
  timestamp: string;
  scripts?: Record<string, string>;
}

export interface InventoryMeta {
  scripts: Record<string, string>;
  dependencies: Record<string, Record<string, string>>;
  entryPoints: { install: string[]; runtime: string[]; bin: string[] };
  metadata: { name: string | null; version: string | null; description: string | null; license: string | null };
}

// SSE event payloads — discriminated union for type safety
interface BaseEvent {
  auditId: string;
  timestamp: string;
}

export interface AuditStartedEvent extends BaseEvent {
  type: "audit_started";
}

export interface PhaseStartedEvent extends BaseEvent {
  type: "phase_started";
  phase: string;
}

export interface PhaseCompletedEvent extends BaseEvent {
  type: "phase_completed";
  phase: string;
  durationMs: number;
}

export interface FileListEvent extends BaseEvent {
  type: "file_list";
  files: FileRecord[];
}

export interface FileAnalyzingEvent extends BaseEvent {
  type: "file_analyzing";
  file: string;
}

export interface FileVerdictEvent extends BaseEvent {
  type: "file_verdict";
  verdict: FileVerdict;
}

export interface TriageCompleteEvent extends BaseEvent {
  type: "triage_complete";
  riskScore: number;
  riskSummary: string;
  focusAreas: FocusArea[];
}

export interface AgentToolCallEvent extends BaseEvent {
  type: "agent_tool_call";
  tool: string;
  args: Record<string, unknown>;
  step: number;
}

export interface AgentToolResultEvent extends BaseEvent {
  type: "agent_tool_result";
  tool: string;
  resultPreview: string;
  step: number;
  injectionDetected: boolean;
}

export interface AgentReasoningEvent extends BaseEvent {
  type: "agent_reasoning";
  text: string;
  step: number;
}

export interface FindingDiscoveredEvent extends BaseEvent {
  type: "finding_discovered";
  finding: Finding;
}

export interface VerdictReachedEvent extends BaseEvent {
  type: "verdict_reached";
  verdict: "SAFE" | "DANGEROUS";
  capabilities: string[];
  proofCount: number;
}

export interface AgentThinkingEvent extends BaseEvent {
  type: "agent_thinking";
  step: number;
}

export interface TriageProgressEvent extends BaseEvent {
  type: "triage_progress";
  current: number;
  total: number;
  file: string;
}

export interface InventoryMetaEvent extends BaseEvent {
  type: "inventory_meta";
  scripts: Record<string, string>;
  dependencies: Record<string, Record<string, string>>;
  entryPoints: { install: string[]; runtime: string[]; bin: string[] };
  metadata: { name: string | null; version: string | null; description: string | null; license: string | null };
}

export interface AuditErrorEvent extends BaseEvent {
  type: "audit_error";
  error?: string;
}

export interface VerifyStartedEvent extends BaseEvent {
  type: "verify_started";
  totalTests: number;
}

export interface VerifyTestResultEvent extends BaseEvent {
  type: "verify_test_result";
  proofIndex: number;
  testFile: string;
  status: "confirmed" | "unconfirmed" | "infra_error";
  error?: string;
}

export type SSEEvent =
  | AuditStartedEvent
  | PhaseStartedEvent
  | PhaseCompletedEvent
  | FileListEvent
  | FileAnalyzingEvent
  | FileVerdictEvent
  | TriageCompleteEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentReasoningEvent
  | FindingDiscoveredEvent
  | VerdictReachedEvent
  | AgentThinkingEvent
  | TriageProgressEvent
  | InventoryMetaEvent
  | AuditErrorEvent
  | VerifyStartedEvent
  | VerifyTestResultEvent;

export const PHASE_ORDER = ["resolve", "inventory", "triage", "investigation", "test-gen", "verify"] as const;

export const AUDIT_PATH_RE = /^\/audit\/([0-9a-f-]{36})$/;

export const PHASE_LABELS: Record<string, string> = {
  resolve: "Resolving package",
  inventory: "Scanning package structure",
  triage: "Analyzing source files",
  investigation: "Starting deep investigation",
  "test-gen": "Generating exploit tests",
  verify: "Running verification",
};

/** Labels shown for quiet (non-agent) phases in the activity feed */
export const PHASE_WAIT_LABELS: Record<string, string> = {
  resolve: "Downloading and unpacking...",
  inventory: "Building file inventory...",
  triage: "Analyzing source files...",
  investigation: "Agent is investigating...",
  "test-gen": "Generating exploit tests...",
  verify: "Running verification in sandbox...",
};

export function parseLineRanges(spec: string | null): Array<[number, number]> {
  if (!spec) return [];
  return spec.split(",").map((range) => {
    const parts = range.trim().split("-").map(Number);
    if (parts.length === 1) return [parts[0], parts[0]] as [number, number];
    return [parts[0], parts[1]] as [number, number];
  });
}
