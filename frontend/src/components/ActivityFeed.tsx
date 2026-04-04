import { useCallback, useEffect, useRef, useState } from "react";
import { useAuditStore } from "../stores/auditStore";
import type { AgentStep, Finding, PipelineLogEntry } from "../lib/types";

// ── Hooks ──

function useTypewriter(text: string, speed = 10): { displayed: string; done: boolean } {
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [text]);
  useEffect(() => {
    if (index >= text.length) return;
    const t = setTimeout(() => setIndex((i) => i + 1), speed);
    return () => clearTimeout(t);
  }, [index, text, speed]);
  return { displayed: text.slice(0, index), done: index >= text.length };
}

function useCountUp(target: number, durationMs = 1000): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) { setVal(0); return; }
    const steps = 20;
    const interval = durationMs / steps;
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setVal(+(target * (i / steps)).toFixed(1));
      if (i >= steps) clearInterval(timer);
    }, interval);
    return () => clearInterval(timer);
  }, [target, durationMs]);
  return val;
}

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

function FindingItem({ finding }: { finding: Finding }) {
  const selectFile = useAuditStore((s) => s.selectFile);

  return (
    <div
      className="feed-item finding-slam"
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
  }, [pipelineLog.length, agentSteps.length, findings.length, agentThinking, isNearBottom]);

  const hasContent =
    pipelineLog.length > 0 || agentSteps.length > 0 || findings.length > 0 || riskSummary;

  // Determine if a tool call is pending (last tool_call with no following tool_result)
  const lastToolCallIndex = (() => {
    for (let i = agentSteps.length - 1; i >= 0; i--) {
      if (agentSteps[i].type === "tool_call") return i;
    }
    return -1;
  })();
  const lastToolCallPending =
    lastToolCallIndex >= 0 &&
    !agentSteps
      .slice(lastToolCallIndex + 1)
      .some((s) => s.type === "tool_result" && s.step === agentSteps[lastToolCallIndex].step);

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
        {!hasContent && !agentThinking && (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: "var(--pending)", fontSize: "0.8rem" }}
          >
            Activity will appear here...
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

        {agentThinking && <ThinkingIndicator />}

        {verdict && <CompletionItem verdict={verdict} proofCount={proofCount} />}

        <div ref={bottomRef} />
      </div>
    </>
  );
}
