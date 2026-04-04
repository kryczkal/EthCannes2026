import { useEffect, useRef } from "react";
import { useAuditStore } from "../stores/auditStore";
import type { AgentStep, Finding } from "../lib/types";

const TOOL_ICONS: Record<string, string> = {
  readFile: ">>",
  listFiles: "ls",
  searchFiles: "/?",
  evalJs: "js",
  requireAndTrace: "rt",
  runLifecycleHook: "lc",
  fastForwardTimers: "ff",
};

function ToolCallEntry({ step }: { step: AgentStep }) {
  const argsStr = step.args ? Object.values(step.args).join(", ") : "";
  return (
    <div className="flex items-start gap-2 px-3 py-1 hover:bg-[var(--color-bg)]/50">
      <span className="text-[10px] font-bold text-[var(--color-investigating)] w-5 shrink-0 text-center mt-0.5">
        {TOOL_ICONS[step.tool || ""] || "??"}
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-[var(--color-investigating)] text-xs">{step.tool}</span>
        <span className="text-[var(--color-text-dim)] text-xs ml-1 truncate">({argsStr.slice(0, 60)})</span>
      </div>
    </div>
  );
}

function ToolResultEntry({ step }: { step: AgentStep }) {
  const preview = step.resultPreview || "";
  const lines = preview.split("\n").slice(0, 3);
  return (
    <div className="px-3 py-1 pl-10">
      {step.injectionDetected && (
        <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-danger)]/20 text-[var(--color-danger)] font-bold mr-2">
          INJECTION DETECTED
        </span>
      )}
      <div className="text-[10px] text-[var(--color-pending)] font-mono leading-tight">
        {lines.map((line, i) => (
          <div key={i} className="truncate">{line || "\u00A0"}</div>
        ))}
        {preview.split("\n").length > 3 && (
          <div className="text-[var(--color-pending)]">... ({preview.length}B)</div>
        )}
      </div>
    </div>
  );
}

function ReasoningEntry({ step }: { step: AgentStep }) {
  return (
    <div className="px-3 py-1 pl-10">
      <div className="text-[10px] text-[var(--color-text-dim)] italic leading-tight">
        {(step.text || "").slice(0, 200)}
        {(step.text || "").length > 200 && "..."}
      </div>
    </div>
  );
}

function FindingEntry({ finding }: { finding: Finding }) {
  return (
    <div className="mx-3 my-1 px-2 py-1.5 rounded border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-[var(--color-danger)]/20 text-[var(--color-danger)]">
          FINDING
        </span>
        <span className="text-xs text-[var(--color-text)]">{finding.capability}</span>
        <span className={`text-[9px] px-1 py-0.5 rounded ${
          finding.confidence === "CONFIRMED" ? "bg-[var(--color-danger)]/20 text-[var(--color-danger)]" :
          finding.confidence === "LIKELY" ? "bg-[var(--color-suspected)]/20 text-[var(--color-suspected)]" :
          "bg-[var(--color-pending)]/20 text-[var(--color-text-dim)]"
        }`}>
          {finding.confidence}
        </span>
        <span className="text-[10px] text-[var(--color-text-dim)] ml-auto">{finding.fileLine}</span>
      </div>
      <div className="text-[10px] text-[var(--color-text-dim)] mt-1 leading-tight">
        {finding.problem.slice(0, 150)}
      </div>
    </div>
  );
}

export function ActivityFeed() {
  const agentSteps = useAuditStore((s) => s.agentSteps);
  const findings = useAuditStore((s) => s.findings);
  const phase = useAuditStore((s) => s.phase);
  const riskSummary = useAuditStore((s) => s.riskSummary);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentSteps.length, findings.length]);

  const hasContent = agentSteps.length > 0 || findings.length > 0 || riskSummary || phase;

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg-secondary)]">
      {!hasContent && (
        <div className="flex items-center justify-center h-full text-[var(--color-pending)] text-xs">
          Agent activity will appear here...
        </div>
      )}

      {/* Risk summary from triage */}
      {riskSummary && (
        <div className="mx-3 my-1 px-2 py-1.5 rounded border border-[var(--color-suspected)]/30 bg-[var(--color-suspected)]/5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-[var(--color-suspected)]/20 text-[var(--color-suspected)]">
              TRIAGE
            </span>
          </div>
          <div className="text-[10px] text-[var(--color-text-dim)] leading-tight">
            {riskSummary}
          </div>
        </div>
      )}

      {/* Agent steps */}
      {agentSteps.map((step, i) => {
        switch (step.type) {
          case "tool_call":
            return <ToolCallEntry key={i} step={step} />;
          case "tool_result":
            return <ToolResultEntry key={i} step={step} />;
          case "reasoning":
            return <ReasoningEntry key={i} step={step} />;
          default:
            return null;
        }
      })}

      {/* Findings */}
      {findings.map((f, i) => (
        <FindingEntry key={i} finding={f} />
      ))}

      <div ref={bottomRef} />
    </div>
  );
}
