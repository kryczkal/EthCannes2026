import { useEffect, useRef, useMemo } from "react";
import { useAuditStore } from "../stores/auditStore";
import { useTypewriter } from "../hooks/useTypewriter";
import { useCountUp } from "../hooks/useCountUp";
import { PHASE_WAIT_LABELS } from "../lib/types";
import type { AgentStep, Finding, PipelineLogEntry } from "../lib/types";

// ── Sub-components ──

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

function ToolCallItem({ step, isPending }: { step: AgentStep; isPending: boolean }) {
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
        {isPending && <span className="tool-spinner" />}
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
  const { displayed, done } = useTypewriter(step.text || "", 10);

  return (
    <div className="feed-item">
      <div className="feed-meta">
        <FeedTag type="think">thinking</FeedTag>
        <span>step {step.step}</span>
      </div>
      <div className="feed-body">
        {displayed}
        {!done && <span className="typewriter-cursor" />}
      </div>
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
        {step.resultPreview
          .split("\n")
          .slice(0, 3)
          .map((line, i) => (
            <div key={i} className="truncate">
              {line || "\u00A0"}
            </div>
          ))}
      </div>
    </div>
  );
}

const CONFIDENCE_STYLE: Record<
  string,
  { color: string; bg: string; border: string }
> = {
  CONFIRMED: {
    color: "var(--danger)",
    bg: "var(--danger-bg)",
    border: "var(--danger)",
  },
  LIKELY: {
    color: "var(--suspected)",
    bg: "var(--suspected-bg)",
    border: "var(--suspected)",
  },
  SUSPECTED: {
    color: "var(--text-muted)",
    bg: "var(--bg-secondary)",
    border: "var(--text-muted)",
  },
};

function FindingItem({ finding }: { finding: Finding }) {
  const selectFile = useAuditStore((s) => s.selectFile);
  const style = CONFIDENCE_STYLE[finding.confidence] ?? CONFIDENCE_STYLE.SUSPECTED;

  return (
    <div
      className="feed-item finding-slam"
      style={{
        borderLeft: `3px solid ${style.border}`,
        background: style.bg,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: "0.85rem",
          color: style.color,
          marginBottom: 2,
        }}
      >
        {finding.capability}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            color: style.color,
            opacity: 0.8,
            marginLeft: 8,
            fontWeight: 400,
          }}
        >
          {finding.confidence}
        </span>
      </div>
      <div className="feed-body">{finding.problem}</div>
      {finding.evidence && finding.evidence !== finding.problem && (
        <div
          className="feed-body"
          style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}
        >
          {finding.evidence.length > 180
            ? finding.evidence.slice(0, 180) + "..."
            : finding.evidence}
        </div>
      )}
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
  const displayScore = useCountUp(riskScore ?? 0, 1200);

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
              {displayScore} / 10
            </strong>
            <br />
          </>
        )}
        {summary}
      </div>
    </div>
  );
}

function PipelineLogItem({ entry }: { entry: PipelineLogEntry }) {
  const selectFile = useAuditStore((s) => s.selectFile);

  switch (entry.kind) {
    case "phase":
      return (
        <div className="feed-item" style={{ opacity: 0.7 }}>
          <div className="feed-meta">
            <FeedTag type="phase">phase</FeedTag>
          </div>
          <div className="feed-body" style={{ fontWeight: 600 }}>{entry.text}</div>
        </div>
      );

    case "info":
      return (
        <div className="feed-item" style={{ opacity: 0.7 }}>
          <div className="feed-body" style={{ color: "var(--text-dim)", fontSize: "0.78rem" }}>
            {entry.text}
          </div>
        </div>
      );

    case "file-scan":
      return (
        <div className="feed-item" style={{ padding: "3px 16px", minHeight: 0 }}>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.72rem",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
            <span style={{
              display: "inline-block",
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "var(--investigating)",
              flexShrink: 0,
            }} />
            {entry.file}
          </div>
        </div>
      );

    case "file-flag":
      return (
        <div
          className="feed-item"
          style={{
            borderLeft: `3px solid ${(entry.risk ?? 0) >= 5 ? "var(--danger)" : "var(--suspected)"}`,
            cursor: entry.file ? "pointer" : undefined,
          }}
          onClick={() => entry.file && selectFile(entry.file)}
        >
          <div className="feed-meta">
            <FeedTag type="triage">flagged</FeedTag>
            {entry.risk !== undefined && (
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.65rem",
                color: entry.risk >= 5 ? "var(--danger)" : "var(--suspected)",
              }}>
                risk {entry.risk}
              </span>
            )}
          </div>
          <div className="feed-body">
            <code>{entry.file}</code>
            {entry.text && <span style={{ color: "var(--text-dim)" }}> — {entry.text}</span>}
          </div>
        </div>
      );

    default:
      return null;
  }
}

function CompletionItem({ verdict, proofCount }: { verdict: "SAFE" | "DANGEROUS"; proofCount: number }) {
  const isSafe = verdict === "SAFE";
  return (
    <div
      className="feed-item"
      style={{
        borderLeft: `3px solid ${isSafe ? "var(--safe)" : "var(--danger)"}`,
        background: isSafe ? "var(--safe-bg)" : "var(--danger-bg)",
        marginTop: 8,
      }}
    >
      <div style={{
        fontWeight: 700,
        fontSize: "0.85rem",
        color: isSafe ? "var(--safe)" : "var(--danger)",
        marginBottom: 2,
      }}>
        {isSafe ? "\u2713" : "\u2717"} Audit complete
      </div>
      <div className="feed-body">
        {isSafe
          ? "No malicious behavior detected. Package is safe to install."
          : `${proofCount} proof${proofCount !== 1 ? "s" : ""} of malicious behavior confirmed.`}
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="feed-item" style={{ opacity: 0.7 }}>
      <div className="feed-meta">
        <FeedTag type="think">thinking</FeedTag>
      </div>
      <div className="feed-body">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </div>
    </div>
  );
}

// ── Main ──

export function ActivityFeed() {
  const pipelineLog = useAuditStore((s) => s.pipelineLog);
  const agentSteps = useAuditStore((s) => s.agentSteps);
  const findings = useAuditStore((s) => s.findings);
  const riskSummary = useAuditStore((s) => s.riskSummary);
  const riskScore = useAuditStore((s) => s.riskScore);
  const verdict = useAuditStore((s) => s.verdict);
  const proofCount = useAuditStore((s) => s.proofCount);
  const agentThinking = useAuditStore((s) => s.agentThinking);
  const isRunning = useAuditStore((s) => s.isRunning);
  const phase = useAuditStore((s) => s.phase);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      userScrolledUp.current = !nearBottom;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [pipelineLog.length, agentSteps.length, findings.length, agentThinking]);

  const hasContent =
    pipelineLog.length > 0 || agentSteps.length > 0 || findings.length > 0 || riskSummary;

  // Determine if a tool call is pending (last tool_call with no following tool_result)
  const lastToolCallIndex = useMemo(() => {
    for (let i = agentSteps.length - 1; i >= 0; i--) {
      if (agentSteps[i].type === "tool_call") return i;
    }
    return -1;
  }, [agentSteps]);

  const lastToolCallPending = useMemo(
    () =>
      lastToolCallIndex >= 0 &&
      !agentSteps
        .slice(lastToolCallIndex + 1)
        .some((s) => s.type === "tool_result" && s.step === agentSteps[lastToolCallIndex].step),
    [agentSteps, lastToolCallIndex],
  );

  const riskLevel =
    riskScore !== null && riskScore >= 7
      ? "high"
      : riskScore !== null && riskScore < 3
        ? "low"
        : "mid";

  return (
    <>
      {/* Header */}
      <div
        className="section-header flex items-center justify-between shrink-0"
        style={{
          padding: "12px 20px 8px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        Activity
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
                riskLevel === "high"
                  ? "var(--danger-bg)"
                  : riskLevel === "low"
                    ? "var(--safe-bg)"
                    : "var(--suspected-bg)",
              color:
                riskLevel === "high"
                  ? "var(--danger)"
                  : riskLevel === "low"
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
        {!hasContent && !agentThinking && (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: "var(--pending)", fontSize: "0.8rem" }}
          >
            {isRunning ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>Connecting to engine</span>
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <span className="thinking-dot" />
              </div>
            ) : (
              "Activity will appear here..."
            )}
          </div>
        )}

        {pipelineLog.map((entry, i) => (
          <PipelineLogItem key={`pl-${i}`} entry={entry} />
        ))}

        {riskSummary && <TriageItem summary={riskSummary} />}

        {agentSteps.map((step, i) => {
          switch (step.type) {
            case "tool_call":
              return (
                <ToolCallItem
                  key={i}
                  step={step}
                  isPending={i === lastToolCallIndex && lastToolCallPending}
                />
              );
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

        {isRunning && !agentThinking && !verdict && phase && PHASE_WAIT_LABELS[phase] && (
          <div className="feed-item" style={{ opacity: 0.6 }}>
            <div className="feed-meta">
              <FeedTag type="phase">{phase}</FeedTag>
              <span className="tool-spinner" />
            </div>
            <div className="feed-body">{PHASE_WAIT_LABELS[phase]}</div>
          </div>
        )}

        {agentThinking && <ThinkingIndicator />}

        {verdict && <CompletionItem verdict={verdict} proofCount={proofCount} />}

        <div ref={bottomRef} />
      </div>
    </>
  );
}
