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
    color: "var(--suspected)",
    bg: "var(--suspected-bg)",
    border: "var(--suspected)",
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

    case "scripts": {
      const LIFECYCLE = ["preinstall", "install", "postinstall", "prepare", "prepack"];
      const scripts = entry.scripts ?? {};
      const lifecycleEntries = Object.entries(scripts).filter(([k]) => LIFECYCLE.includes(k));
      if (lifecycleEntries.length === 0) return null;
      return (
        <div
          className="feed-item"
          style={{ borderLeft: "3px solid var(--danger)" }}
        >
          <div className="feed-meta">
            <FeedTag type="finding">lifecycle</FeedTag>
          </div>
          <div className="feed-body">
            {lifecycleEntries.map(([name, cmd]) => (
              <div key={name} style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.72rem",
                display: "flex",
                gap: 6,
              }}>
                <span style={{ color: "var(--danger)", fontWeight: 600, flexShrink: 0 }}>{name}</span>
                <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {cmd.length > 60 ? cmd.slice(0, 60) + "..." : cmd}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

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

function CompletionItem({ verdict }: { verdict: "SAFE" | "DANGEROUS" }) {
  const proofs = useAuditStore((s) => s.proofs);
  const findings = useAuditStore((s) => s.findings);
  const dealbreaker = proofs.find(
    (p) => p.kind === "STRUCTURAL" && p.evidence?.startsWith("Dealbreaker:")
  );

  const proofByFileLine = Object.fromEntries(proofs.map(p => [p.fileLine, p]));
  const verified = findings.filter(f => proofByFileLine[f.fileLine]?.kind === "TEST_CONFIRMED").length;
  const observed = findings.filter(f => proofByFileLine[f.fileLine]?.kind === "AI_DYNAMIC").length;

  let summary: string;
  let color: string;
  let bg: string;
  let icon: string;

  if (verdict === "SAFE") {
    summary = "No malicious behavior detected. Package appears safe to install.";
    color = "var(--safe)";
    bg = "var(--safe-bg)";
    icon = "\u2713";
  } else if (dealbreaker) {
    summary = `Dealbreaker detected — ${dealbreaker.problem}. Skipped to DANGEROUS.`;
    color = "var(--danger)";
    bg = "var(--danger-bg)";
    icon = "\u2717";
  } else if (verified > 0) {
    const rest = findings.length - verified;
    summary = `${verified} finding${verified !== 1 ? "s" : ""} verified by exploit tests.${rest > 0 ? ` ${rest} additional flagged.` : ""}`;
    color = "var(--danger)";
    bg = "var(--danger-bg)";
    icon = "\u2717";
  } else if (observed > 0) {
    summary = `${observed} finding${observed !== 1 ? "s" : ""} observed at runtime but not verified by tests. Review recommended.`;
    color = "var(--suspected)";
    bg = "var(--suspected-bg)";
    icon = "?";
  } else if (findings.length > 0) {
    summary = `${findings.length} finding${findings.length !== 1 ? "s" : ""} flagged by static analysis but none verified. Manual review recommended.`;
    color = "var(--text-muted)";
    bg = "var(--bg-secondary)";
    icon = "?";
  } else {
    summary = "Analysis complete. No findings.";
    color = "var(--safe)";
    bg = "var(--safe-bg)";
    icon = "\u2713";
  }

  return (
    <div
      className="feed-item"
      style={{
        borderLeft: `3px solid ${color}`,
        background: bg,
        marginTop: 8,
      }}
    >
      <div style={{
        fontWeight: 700,
        fontSize: "0.85rem",
        color,
        marginBottom: 2,
      }}>
        {icon} Audit complete
      </div>
      <div className="feed-body">{summary}</div>
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
  const verdict = useAuditStore((s) => s.verdict);
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

        {isRunning && !agentThinking && !lastToolCallPending && !verdict && phase && PHASE_WAIT_LABELS[phase] && (
          <div className="feed-item" style={{ opacity: 0.6 }}>
            <div className="feed-meta">
              <FeedTag type="phase">{phase}</FeedTag>
              <span className="tool-spinner" />
            </div>
            <div className="feed-body">{PHASE_WAIT_LABELS[phase]}</div>
          </div>
        )}

        {agentThinking && <ThinkingIndicator />}

        {verdict && <CompletionItem verdict={verdict} />}

        <div ref={bottomRef} />
      </div>
    </>
  );
}
