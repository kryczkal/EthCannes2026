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

// SSE event payloads
export interface SSEEvent {
  type: string;
  auditId: string;
  timestamp: string;
  [key: string]: unknown;
}

export const PHASE_ORDER = ["resolve", "inventory", "triage", "investigation", "test-gen", "verify"] as const;

export function parseLineRanges(spec: string | null): Array<[number, number]> {
  if (!spec) return [];
  return spec.split(",").map((range) => {
    const parts = range.trim().split("-").map(Number);
    if (parts.length === 1) return [parts[0], parts[0]] as [number, number];
    return [parts[0], parts[1]] as [number, number];
  });
}
