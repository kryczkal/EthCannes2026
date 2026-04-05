import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { AuditReport, FileRecord, FileVerdict, Finding, TriageResult } from "./models.js";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export interface AuditEvent {
  type: string;
  auditId: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface AuditStarted extends AuditEvent { type: "audit_started"; packageName: string }
export interface PhaseStarted extends AuditEvent { type: "phase_started"; phase: string }
export interface PhaseCompleted extends AuditEvent { type: "phase_completed"; phase: string; durationMs: number }
export interface FileList extends AuditEvent { type: "file_list"; files: FileRecord[] }
export interface FileAnalyzing extends AuditEvent { type: "file_analyzing"; file: string }
export interface FileVerdictEvent extends AuditEvent { type: "file_verdict"; verdict: FileVerdict }
export interface TriageComplete extends AuditEvent { type: "triage_complete"; riskScore: number; riskSummary: string; focusAreas: TriageResult["focusAreas"] }
export interface AgentToolCall extends AuditEvent { type: "agent_tool_call"; tool: string; args: Record<string, unknown>; step: number }
export interface AgentToolResult extends AuditEvent { type: "agent_tool_result"; tool: string; resultPreview: string; step: number; injectionDetected: boolean }
export interface AgentReasoning extends AuditEvent { type: "agent_reasoning"; text: string; step: number }
export interface FindingDiscovered extends AuditEvent { type: "finding_discovered"; finding: Finding }
export interface VerdictReached extends AuditEvent { type: "verdict_reached"; verdict: string; capabilities: string[]; proofCount: number }
export interface AgentThinking extends AuditEvent { type: "agent_thinking"; step: number }
export interface TriageProgress extends AuditEvent { type: "triage_progress"; current: number; total: number; file: string }
export interface InventoryMeta extends AuditEvent {
  type: "inventory_meta";
  scripts: Record<string, string>;
  dependencies: Record<string, Record<string, string>>;
  entryPoints: { install: string[]; runtime: string[]; bin: string[] };
  metadata: { name: string | null; version: string | null; description: string | null; license: string | null };
}
export interface AuditError extends AuditEvent { type: "audit_error"; error: string }

// ---------------------------------------------------------------------------
// Emit helper — a simple callback the pipeline threads through phases
// ---------------------------------------------------------------------------

export type EmitFn = (type: string, payload: Record<string, unknown>) => void;

export function createEmitFn(auditId: string, emitter: EventEmitter): EmitFn {
  return (type: string, payload: Record<string, unknown>) => {
    const event: AuditEvent = {
      type,
      auditId,
      timestamp: new Date().toISOString(),
      ...payload,
    };
    emitter.emit("event", event);
  };
}

export function setSessionPackagePath(auditId: string, packagePath: string): void {
  const session = sessions.get(auditId);
  if (session) session.packagePath = packagePath;
}

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

export interface AuditSession {
  auditId: string;
  emitter: EventEmitter;
  eventBuffer: AuditEvent[];
  packagePath: string | null;
  report: AuditReport | null;
  status: "running" | "done" | "error";
  cleanupFn: (() => void) | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

const sessions = new Map<string, AuditSession>();

const SESSION_TTL_MS = 30 * 60_000; // 30 minutes after completion

export function createSession(packageName: string): AuditSession {
  const auditId = randomUUID();
  const emitter = new EventEmitter();
  emitter.setMaxListeners(20);
  const session: AuditSession = {
    auditId,
    emitter,
    eventBuffer: [],
    packagePath: null,
    report: null,
    status: "running",
    cleanupFn: null,
    cleanupTimer: null,
  };
  // Buffer all events so late-connecting SSE clients can replay them
  emitter.on("event", (event: AuditEvent) => {
    session.eventBuffer.push(event);
  });
  sessions.set(auditId, session);
  return session;
}

export function getSession(auditId: string): AuditSession | undefined {
  return sessions.get(auditId);
}

export function finalizeSession(auditId: string, report: AuditReport | null, error?: string): void {
  const session = sessions.get(auditId);
  if (!session) return;
  session.report = report;
  session.status = error ? "error" : "done";
  // Schedule cleanup of the session and package files
  session.cleanupTimer = setTimeout(() => {
    if (session.cleanupFn) session.cleanupFn();
    sessions.delete(auditId);
  }, SESSION_TTL_MS);
}
