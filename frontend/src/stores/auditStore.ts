import { create } from "zustand";
import type {
  FileRecord,
  FileVerdict,
  FileStatus,
  PhaseInfo,
  AgentStep,
  Finding,
  FocusArea,
  SSEEvent,
} from "../lib/types";
import { PHASE_ORDER } from "../lib/types";

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

  // Investigation
  agentSteps: AgentStep[];
  findings: Finding[];

  // Verdict
  verdict: "SAFE" | "DANGEROUS" | null;
  capabilities: string[];
  proofCount: number;

  // UI state
  selectedFile: string | null;
  selectedFileContent: string | null;
  autoFollow: boolean;
  error: string | null;

  // Actions
  startAudit: (packageName: string) => Promise<void>;
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
  agentSteps: [],
  findings: [],
  verdict: null,
  capabilities: [],
  proofCount: 0,
  selectedFile: null,
  selectedFileContent: null,
  autoFollow: true,
  error: null,
};

let activeEventSource: EventSource | null = null;

export const useAuditStore = create<AuditState>((set, get) => ({
  ...initialState,

  reset: () => {
    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }
    set({ ...initialState, phases: PHASE_ORDER.map((name) => ({ name, status: "pending" as const })) });
  },

  startAudit: async (packageName: string) => {
    get().reset();
    set({ packageName, isRunning: true });

    let res: Response;
    try {
      res = await fetch(`${API_BASE}/audit/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageName }),
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

    // Connect SSE
    const es = new EventSource(`${API_BASE}/audit/${auditId}/events`);
    activeEventSource = es;

    const handler = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data) as SSEEvent;
        get().handleEvent(event);
      } catch {
        // Malformed SSE data — skip this event
      }
    };

    // Listen for all event types
    const eventTypes = [
      "audit_started", "phase_started", "phase_completed",
      "file_list", "file_analyzing", "file_verdict",
      "triage_complete", "agent_tool_call", "agent_tool_result",
      "agent_reasoning", "finding_discovered", "verdict_reached",
      "audit_error",
    ] as const;
    for (const type of eventTypes) {
      es.addEventListener(type, handler);
    }

    es.onerror = () => {
      es.close();
      activeEventSource = null;
      set({ isRunning: false });
    };
  },

  handleEvent: (event: SSEEvent) => {
    const state = get();

    switch (event.type) {
      case "phase_started": {
        set({
          phase: event.phase,
          phases: state.phases.map((p) =>
            p.name === event.phase ? { ...p, status: "active" } : p
          ),
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
        set({ files: event.files, fileStatuses: statuses });
        break;
      }

      case "file_analyzing": {
        set({
          fileStatuses: { ...state.fileStatuses, [event.file]: "analyzing" },
        });
        break;
      }

      case "file_verdict": {
        const { verdict } = event;
        const status: FileStatus =
          verdict.riskContribution >= 5 ? "dangerous" :
          verdict.riskContribution >= 3 ? "suspicious" : "safe";
        set({
          fileStatuses: { ...state.fileStatuses, [verdict.file]: status },
          fileVerdicts: { ...state.fileVerdicts, [verdict.file]: verdict },
        });
        break;
      }

      case "triage_complete": {
        set({
          riskScore: event.riskScore,
          riskSummary: event.riskSummary,
          focusAreas: event.focusAreas,
        });
        break;
      }

      case "agent_tool_call": {
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
        });
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

    try {
      const res = await fetch(`${API_BASE}/audit/${auditId}/file/${filePath}`);
      if (res.ok) {
        const content = await res.text();
        set({ selectedFileContent: content });
      }
    } catch { /* ignore */ }
  },
}));
