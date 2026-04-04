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
};

export const useAuditStore = create<AuditState>((set, get) => ({
  ...initialState,

  reset: () => set({ ...initialState, phases: PHASE_ORDER.map((name) => ({ name, status: "pending" as const })) }),

  startAudit: async (packageName: string) => {
    get().reset();
    set({ packageName, isRunning: true });

    const res = await fetch(`${API_BASE}/audit/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageName }),
    });

    if (!res.ok) {
      set({ isRunning: false });
      return;
    }

    const { auditId } = await res.json();
    set({ auditId });

    // Connect SSE
    const es = new EventSource(`${API_BASE}/audit/${auditId}/events`);

    const handler = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data) as SSEEvent;
        get().handleEvent(event);
      } catch { /* ignore parse errors */ }
    };

    // Listen for all event types
    const eventTypes = [
      "audit_started", "phase_started", "phase_completed",
      "file_list", "file_analyzing", "file_verdict",
      "triage_complete", "agent_tool_call", "agent_tool_result",
      "agent_reasoning", "finding_discovered", "verdict_reached",
      "audit_error",
    ];
    for (const type of eventTypes) {
      es.addEventListener(type, handler);
    }

    es.onerror = () => {
      es.close();
      set({ isRunning: false });
    };
  },

  handleEvent: (event: SSEEvent) => {
    const state = get();

    switch (event.type) {
      case "phase_started": {
        const phase = event.phase as string;
        set({
          phase,
          phases: state.phases.map((p) =>
            p.name === phase ? { ...p, status: "active" } : p
          ),
        });
        break;
      }

      case "phase_completed": {
        const phase = event.phase as string;
        const durationMs = event.durationMs as number;
        set({
          phases: state.phases.map((p) =>
            p.name === phase ? { ...p, status: "done", durationMs } : p
          ),
        });
        break;
      }

      case "file_list": {
        const files = event.files as FileRecord[];
        const statuses: Record<string, FileStatus> = {};
        for (const f of files) {
          statuses[f.path] = "pending";
        }
        set({ files, fileStatuses: statuses });
        break;
      }

      case "file_analyzing": {
        const file = event.file as string;
        set({
          fileStatuses: { ...state.fileStatuses, [file]: "analyzing" },
        });
        break;
      }

      case "file_verdict": {
        const verdict = event.verdict as FileVerdict;
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
          riskScore: event.riskScore as number,
          riskSummary: event.riskSummary as string,
          focusAreas: event.focusAreas as FocusArea[],
        });
        break;
      }

      case "agent_tool_call": {
        const step: AgentStep = {
          type: "tool_call",
          tool: event.tool as string,
          args: event.args as Record<string, unknown>,
          step: event.step as number,
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
          tool: event.tool as string,
          resultPreview: event.resultPreview as string,
          step: event.step as number,
          timestamp: event.timestamp,
          injectionDetected: event.injectionDetected as boolean,
        };
        set({ agentSteps: [...state.agentSteps, step] });
        break;
      }

      case "agent_reasoning": {
        const step: AgentStep = {
          type: "reasoning",
          text: event.text as string,
          step: event.step as number,
          timestamp: event.timestamp,
        };
        set({ agentSteps: [...state.agentSteps, step] });
        break;
      }

      case "finding_discovered": {
        const finding = event.finding as Finding;
        set({ findings: [...state.findings, finding] });
        break;
      }

      case "verdict_reached": {
        set({
          verdict: event.verdict as "SAFE" | "DANGEROUS",
          capabilities: event.capabilities as string[],
          proofCount: event.proofCount as number,
          isRunning: false,
        });
        break;
      }

      case "audit_error": {
        set({ isRunning: false });
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
