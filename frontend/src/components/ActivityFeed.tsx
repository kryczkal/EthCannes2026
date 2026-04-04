import { useCallback, useEffect, useRef } from "react";
import { useAuditStore } from "../stores/auditStore";
import type { AgentStep, Finding } from "../lib/types";

function FeedTag({
  type,
  children,
}: {
  type: "tool" | "think" | "finding" | "triage" | "phase";
  children: React.ReactNode;
}) {
  const colors: Record<string, { bg: string; fg: string }> = {
    tool: { bg: "var(--investigating-bg)", fg: "var(--investigating)" },
    think: { bg: "var(--accent-bg)", fg: "var(--accent-light)" },
    finding: { bg: "var(--danger-bg)", fg: "var(--danger)" },
    triage: { bg: "var(--suspected-bg)", fg: "var(--suspected)" },
    phase: { bg: "var(--bg-tertiary)", fg: "var(--text-dim)" },
  };
  const c = colors[type];
  return (
    <span
      style={{
        padding: "1px 5px",
        borderRadius: 3,
        fontSize: "0.6rem",
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
      }}
    >
      {children}
    </span>
  );
}

function ToolCallItem({ step }: { step: AgentStep }) {
  const selectFile = useAuditStore((s) => s.selectFile);
  const filePath =
    step.tool === "readFile"
      ? (step.args as { path?: string })?.path
      : undefined;

  return (
    <div className="feed-item" style={{ cursor: filePath ? "pointer" : undefined }}>
      <div className="feed-meta">
        <FeedTag type="tool">{step.tool || "tool"}</FeedTag>
        <span>step {step.step}</span>
      </div>
      <div className="feed-body">
        {step.tool === "readFile" && filePath ? (
          <>
            Reading <code>{filePath}</code>
          </>
        ) : (
          <>
            {step.tool}
            {step.args && (
              <span style={{ color: "var(--text-muted)" }}>
                {" "}
                ({Object.values(step.args).join(", ").slice(0, 80)})
              </span>
            )}
          </>
        )}
      </div>
      {filePath && (
        <div
          className="feed-file-ref"
          onClick={(e) => {
            e.stopPropagation();
            selectFile(filePath);
          }}
        >
          → {filePath}
        </div>
      )}
    </div>
  );
}

function ReasoningItem({ step }: { step: AgentStep }) {
  return (
    <div className="feed-item">
      <div className="feed-meta">
        <FeedTag type="think">thinking</FeedTag>
        <span>step {step.step}</span>
      </div>
      <div className="feed-body">{step.text}</div>
    </div>
  );
}

function ToolResultItem({ step }: { step: AgentStep }) {
  if (!step.resultPreview) return null;
  return (
    <div className="feed-item" style={{ paddingLeft: 32, opacity: 0.7 }}>
      {step.injectionDetected && (
        <span
          style={{
            fontSize: "0.6rem",
            padding: "1px 4px",
            borderRadius: 2,
            background: "var(--danger-bg)",
            color: "var(--danger)",
            fontWeight: 700,
            marginBottom: 2,
            display: "inline-block",
          }}
        >
          INJECTION DETECTED
        </span>
      )}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.7rem",
          color: "var(--text-muted)",
          lineHeight: 1.5,
        }}
      >
        {step.resultPreview.split("\n").slice(0, 3).map((line, i) => (
          <div key={i} className="truncate">
            {line || "\u00A0"}
          </div>
        ))}
      </div>
    </div>
  );
}

function FindingItem({ finding }: { finding: Finding }) {
  const selectFile = useAuditStore((s) => s.selectFile);

  return (
    <div
      className="feed-item"
      style={{
        borderLeft: "3px solid var(--danger)",
        background: "var(--danger-bg)",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: "0.85rem",
          color: "var(--danger)",
          marginBottom: 2,
        }}
      >
        {finding.capability}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            color: "var(--text-muted)",
            marginLeft: 8,
            fontWeight: 400,
          }}
        >
          {finding.confidence}
        </span>
      </div>
      <div className="feed-body">{finding.problem}</div>
      {finding.fileLine && (
        <div
          className="feed-file-ref"
          onClick={() => {
            const file = finding.fileLine.split(":")[0];
            if (file) selectFile(file);
          }}
        >
          → {finding.fileLine}
        </div>
      )}
    </div>
  );
}

function TriageItem({ summary }: { summary: string }) {
  const riskScore = useAuditStore((s) => s.riskScore);
  return (
    <div className="feed-item">
      <div className="feed-meta">
        <FeedTag type="triage">triage</FeedTag>
      </div>
      <div className="feed-body">
        {riskScore !== null && (
          <>
            Risk score:{" "}
            <strong
              style={{
                color:
                  riskScore >= 7
                    ? "var(--danger)"
                    : riskScore >= 3
                      ? "var(--suspected)"
                      : "var(--safe)",
              }}
            >
              {riskScore} / 10
            </strong>
            <br />
          </>
        )}
        {summary}
      </div>
    </div>
  );
}

export function ActivityFeed() {
  const agentSteps = useAuditStore((s) => s.agentSteps);
  const findings = useAuditStore((s) => s.findings);
  const riskSummary = useAuditStore((s) => s.riskSummary);
  const riskScore = useAuditStore((s) => s.riskScore);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  useEffect(() => {
    if (isNearBottom()) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [agentSteps.length, findings.length, isNearBottom]);

  const hasContent = agentSteps.length > 0 || findings.length > 0 || riskSummary;

  const riskPillClass =
    riskScore !== null && riskScore >= 7
      ? "high"
      : riskScore !== null && riskScore < 3
        ? "low"
        : "mid";

  return (
    <>
      {/* Header */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{
          padding: "12px 20px 8px",
          fontFamily: "var(--font-mono)",
          fontSize: "0.65rem",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          borderBottom: "1px solid var(--border)",
        }}
      >
        Agent Activity
        {riskScore !== null && (
          <span
            style={{
              fontSize: "0.7rem",
              padding: "2px 8px",
              borderRadius: 10,
              fontWeight: 600,
              textTransform: "none",
              letterSpacing: 0,
              background:
                riskPillClass === "high"
                  ? "var(--danger-bg)"
                  : riskPillClass === "low"
                    ? "var(--safe-bg)"
                    : "var(--suspected-bg)",
              color:
                riskPillClass === "high"
                  ? "var(--danger)"
                  : riskPillClass === "low"
                    ? "var(--safe)"
                    : "var(--suspected)",
            }}
          >
            {riskScore}
          </span>
        )}
      </div>

      {/* Feed */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto"
        aria-live="polite"
        aria-relevant="additions"
      >
        {!hasContent && (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: "var(--pending)", fontSize: "0.8rem" }}
          >
            Agent activity will appear here...
          </div>
        )}

        {riskSummary && <TriageItem summary={riskSummary} />}

        {agentSteps.map((step, i) => {
          switch (step.type) {
            case "tool_call":
              return <ToolCallItem key={i} step={step} />;
            case "tool_result":
              return <ToolResultItem key={i} step={step} />;
            case "reasoning":
              return <ReasoningItem key={i} step={step} />;
            default:
              return null;
          }
        })}

        {findings.map((f, i) => (
          <FindingItem key={`f-${i}`} finding={f} />
        ))}

        <div ref={bottomRef} />
      </div>
    </>
  );
}
