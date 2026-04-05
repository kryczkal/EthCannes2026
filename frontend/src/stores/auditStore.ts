import { create } from "zustand";
import type {
  FileRecord,
  FileVerdict,
  FileStatus,
  PhaseInfo,
  AgentStep,
  Finding,
  FocusArea,
  Proof,
  SSEEvent,
  PipelineLogEntry,
  InventoryMeta,
} from "../lib/types";
import { PHASE_ORDER, PHASE_LABELS } from "../lib/types";

const API_BASE = "/api";

interface AuditState {
  // Audit session
  auditId: string | null;
  packageName: string;
  isRunning: boolean;

  // Pipeline state
  phase: string | null;
  phases: PhaseInfo[];

  // File tree
  files: FileRecord[];
  fileStatuses: Record<string, FileStatus>;
  fileVerdicts: Record<string, FileVerdict>;

  // Triage
  riskScore: number | null;
  riskSummary: string | null;
  focusAreas: FocusArea[];

  // Pipeline activity (early phases)
  pipelineLog: PipelineLogEntry[];

  // Investigation
  agentSteps: AgentStep[];
  findings: Finding[];

  // Verdict
  verdict: "SAFE" | "DANGEROUS" | null;
  capabilities: string[];
  proofCount: number;
  proofs: Proof[];

  // Inventory metadata
  inventoryMeta: InventoryMeta | null;

  // UI state
  selectedFile: string | null;
  selectedFileContent: string | null;
  autoFollow: boolean;
  error: string | null;

  // Animation state
  agentThinking: boolean;
  triageProgress: { current: number; total: number } | null;

  // Actions
  startAudit: (packageName: string, version?: string) => Promise<void>;
  connectToSession: (auditId: string) => Promise<void>;
  handleEvent: (event: SSEEvent) => void;
  selectFile: (path: string) => Promise<void>;
  reset: () => void;
}

const initialState = {
  auditId: null,
  packageName: "",
  isRunning: false,
  phase: null,
  phases: PHASE_ORDER.map((name) => ({ name, status: "pending" as const })),
  files: [],
  fileStatuses: {},
  fileVerdicts: {},
  riskScore: null,
  riskSummary: null,
  focusAreas: [],
  pipelineLog: [],
  agentSteps: [],
  findings: [],
  verdict: null,
  capabilities: [],
  proofCount: 0,
  proofs: [],
  inventoryMeta: null,
  selectedFile: null,
  selectedFileContent: null,
  autoFollow: true,
  error: null,
  agentThinking: false,
  triageProgress: null,
};

let activeEventSource: EventSource | null = null;
let activeFileAbort: AbortController | null = null;
let seenEventTimestamps = new Set<string>();

function connectSSE(
  auditId: string,
  set: (partial: Partial<AuditState>) => void,
  get: () => AuditState,
) {
  // Close any existing connection first (guards against React Strict Mode double-fire)
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }
  const es = new EventSource(`${API_BASE}/audit/${auditId}/events`);
  activeEventSource = es;

  const handler = (e: MessageEvent) => {
    try {
      const event = JSON.parse(e.data) as SSEEvent;
      get().handleEvent(event);
    } catch (err) {
      console.warn("Malformed SSE event, skipping:", err);
    }
  };

  const eventTypes = [
    "audit_started", "phase_started", "phase_completed",
    "file_list", "file_analyzing", "file_verdict",
    "triage_complete", "triage_progress", "inventory_meta",
    "agent_thinking", "agent_tool_call", "agent_tool_result",
    "agent_reasoning", "finding_discovered", "verdict_reached",
    "audit_error",
  ] as const;
  for (const type of eventTypes) {
    es.addEventListener(type, handler);
  }

  es.onerror = () => {
    es.close();
    activeEventSource = null;
    if (get().isRunning) {
      set({ isRunning: false, error: "Lost connection to audit engine" });
    }
  };
}

export const useAuditStore = create<AuditState>((set, get) => ({
  ...initialState,

  reset: () => {
    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }
    seenEventTimestamps = new Set();
    set({ ...initialState, phases: PHASE_ORDER.map((name) => ({ name, status: "pending" as const })) });
  },

  startAudit: async (packageName: string, version?: string) => {
    get().reset();
    set({ packageName, isRunning: true });

    let res: Response;
    try {
      res = await fetch(`${API_BASE}/audit/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageName, ...(version && { version }) }),
      });
    } catch {
      set({ isRunning: false, error: "Failed to connect to audit engine" });
      return;
    }

    if (!res.ok) {
      set({ isRunning: false, error: `Engine returned ${res.status}` });
      return;
    }

    let auditId: string;
    try {
      const body = await res.json();
      auditId = body.auditId;
    } catch {
      set({ isRunning: false, error: "Invalid response from engine" });
      return;
    }
    set({ auditId });

    connectSSE(auditId, set, get);
  },

  connectToSession: async (auditId: string) => {
    get().reset();
    set({ auditId, isRunning: true });

    // Check if session exists before connecting SSE
    try {
      const res = await fetch(`${API_BASE}/audit/${auditId}/report`);
      if (!res.ok) {
        const msg = res.status === 404
          ? "This audit session has expired or was not found."
          : `Engine returned ${res.status}`;
        set({ isRunning: false, error: msg });
        return;
      }
    } catch {
      set({ isRunning: false, error: "Failed to connect to audit engine" });
      return;
    }

    connectSSE(auditId, set, get);
  },

  handleEvent: (event: SSEEvent) => {
    // Deduplicate: skip events we've already processed (guards against SSE replay + Strict Mode)
    const eventKey = `${event.type}:${event.timestamp}`;
    if (seenEventTimestamps.has(eventKey)) return;
    seenEventTimestamps.add(eventKey);

    const state = get();

    switch (event.type) {
      case "phase_started": {
        set({
          phase: event.phase,
          phases: state.phases.map((p) =>
            p.name === event.phase ? { ...p, status: "active" } : p
          ),
          pipelineLog: [...state.pipelineLog, {
            kind: "phase" as const,
            text: PHASE_LABELS[event.phase] || event.phase,
            timestamp: event.timestamp,
          }],
        });
        break;
      }

      case "phase_completed": {
        set({
          phases: state.phases.map((p) =>
            p.name === event.phase ? { ...p, status: "done", durationMs: event.durationMs } : p
          ),
        });
        break;
      }

      case "file_list": {
        const statuses: Record<string, FileStatus> = {};
        for (const f of event.files) {
          statuses[f.path] = "pending";
        }
        const dirs = new Set(
          event.files.map((f) => f.path.split("/").slice(0, -1).join("/")).filter(Boolean)
        );
        set({
          files: event.files,
          fileStatuses: statuses,
          pipelineLog: [...state.pipelineLog, {
            kind: "info" as const,
            text: `Found ${event.files.length} files${dirs.size > 0 ? ` across ${dirs.size} directories` : ""}`,
            timestamp: event.timestamp,
          }],
        });
        break;
      }

      case "file_analyzing": {
        set({
          fileStatuses: { ...state.fileStatuses, [event.file]: "analyzing" },
          pipelineLog: [...state.pipelineLog, {
            kind: "file-scan" as const,
            text: event.file,
            file: event.file,
            timestamp: event.timestamp,
          }],
        });
        // Auto-follow: open file in viewer during triage
        if (state.autoFollow && state.phase === "triage") {
          get().selectFile(event.file);
        }
        break;
      }

      case "file_verdict": {
        const { verdict } = event;
        const status: FileStatus =
          verdict.riskContribution >= 5 ? "dangerous" :
            verdict.riskContribution >= 3 ? "suspicious" : "safe";
        const pipelineLog = verdict.riskContribution >= 3
          ? [...state.pipelineLog, {
            kind: "file-flag" as const,
            text: verdict.summary || `Risk ${verdict.riskContribution}/10`,
            file: verdict.file,
            risk: verdict.riskContribution,
            timestamp: event.timestamp,
          }]
          : state.pipelineLog;
        set({
          fileStatuses: { ...state.fileStatuses, [verdict.file]: status },
          fileVerdicts: { ...state.fileVerdicts, [verdict.file]: verdict },
          pipelineLog,
        });
        break;
      }

      case "triage_progress": {
        set({ triageProgress: { current: event.current, total: event.total } });
        break;
      }

      case "inventory_meta": {
        const meta: InventoryMeta = {
          scripts: event.scripts,
          dependencies: event.dependencies,
          entryPoints: event.entryPoints,
          metadata: event.metadata,
        };
        const LIFECYCLE_SCRIPTS = ["preinstall", "install", "postinstall", "prepare", "prepack"];
        const lifecycle = Object.entries(event.scripts)
          .filter(([k]) => LIFECYCLE_SCRIPTS.includes(k));
        const newEntries: typeof state.pipelineLog = [];
        if (lifecycle.length > 0) {
          newEntries.push({
            kind: "scripts" as const,
            text: lifecycle.map(([k, v]) => `${k}: ${v}`).join("\n"),
            scripts: event.scripts,
            timestamp: event.timestamp,
          });
        }
        const depCounts = Object.entries(event.dependencies)
          .filter(([, deps]) => Object.keys(deps).length > 0)
          .map(([kind, deps]) => `${Object.keys(deps).length} ${kind}`)
          .join(" · ");
        if (depCounts) {
          newEntries.push({
            kind: "info" as const,
            text: depCounts + " dependencies",
            timestamp: event.timestamp,
          });
        }
        set({
          inventoryMeta: meta,
          pipelineLog: [...state.pipelineLog, ...newEntries],
        });
        break;
      }

      case "triage_complete": {
        set({
          riskScore: event.riskScore,
          riskSummary: event.riskSummary,
          focusAreas: event.focusAreas,
          triageProgress: null,
        });
        break;
      }

      case "agent_thinking": {
        set({ agentThinking: true });
        break;
      }

      case "agent_tool_call": {
        set({ agentThinking: false });
        const step: AgentStep = {
          type: "tool_call",
          tool: event.tool,
          args: event.args,
          step: event.step,
          timestamp: event.timestamp,
        };
        set({ agentSteps: [...state.agentSteps, step] });

        // Auto-follow: if agent reads a file, select it
        if (state.autoFollow && event.tool === "readFile") {
          const filePath = (event.args as { path?: string })?.path;
          if (filePath) get().selectFile(filePath);
        }
        break;
      }

      case "agent_tool_result": {
        const step: AgentStep = {
          type: "tool_result",
          tool: event.tool,
          resultPreview: event.resultPreview,
          step: event.step,
          timestamp: event.timestamp,
          injectionDetected: event.injectionDetected,
        };
        set({ agentSteps: [...state.agentSteps, step] });
        break;
      }

      case "agent_reasoning": {
        set({ agentThinking: false });
        const step: AgentStep = {
          type: "reasoning",
          text: event.text,
          step: event.step,
          timestamp: event.timestamp,
        };
        set({ agentSteps: [...state.agentSteps, step] });
        break;
      }

      case "finding_discovered": {
        set({ findings: [...state.findings, event.finding] });
        break;
      }

      case "verdict_reached": {
        set({
          verdict: event.verdict,
          capabilities: event.capabilities,
          proofCount: event.proofCount,
          isRunning: false,
          agentThinking: false,
        });
        // Fetch full report to hydrate proof details (non-blocking)
        const { auditId } = get();
        if (auditId) {
          fetch(`${API_BASE}/audit/${auditId}/report`)
            .then((r) => (r.ok ? r.json() : null))
            .then((report) => {
              if (report?.proofs) set({ proofs: report.proofs });
            })
            .catch(() => { });
        }
        break;
      }

      case "audit_error": {
        set({ isRunning: false, error: event.error ?? "Audit failed" });
        break;
      }
    }
  },

  selectFile: async (filePath: string) => {
    const { auditId } = get();
    set({ selectedFile: filePath, selectedFileContent: null });

    if (!auditId) return;

    // Cancel any in-flight file fetch
    activeFileAbort?.abort();
    const controller = new AbortController();
    activeFileAbort = controller;

    try {
      const res = await fetch(
        `${API_BASE}/audit/${auditId}/file/${filePath}`,
        { signal: controller.signal },
      );
      if (res.ok) {
        const content = await res.text();
        if (get().selectedFile === filePath) {
          set({ selectedFileContent: content });
        }
      } else {
        if (get().selectedFile === filePath) {
          set({ selectedFileContent: `// Failed to load file (${res.status})` });
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (get().selectedFile === filePath) {
        set({ selectedFileContent: "// Failed to load file" });
      }
    }
  },
}));
