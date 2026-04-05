import { useState } from "react";
import { useAuditStore } from "../stores/auditStore";
import type { Finding } from "../lib/types";

function FindingCard({
  finding,
  isExpanded,
  onToggle,
  onShowCode,
}: {
  finding: Finding;
  isExpanded: boolean;
  onToggle: () => void;
  onShowCode: () => void;
}) {
  const selectFile = useAuditStore((s) => s.selectFile);

  const caps = finding.capability
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const isConfirmed = finding.confidence === "CONFIRMED";

  return (
    <div
      onClick={onToggle}
      style={{
        borderBottom: "1px solid var(--border)",
        cursor: "pointer",
        background: isExpanded ? "var(--bg-secondary)" : undefined,
        transition: "background 0.15s",
      }}
    >
      {/* Always visible: cap tag + name + confidence */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          padding: "14px 20px 0",
        }}
      >
        {caps.map((cap) => (
          <span
            key={cap}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6rem",
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: 3,
              letterSpacing: "0.03em",
              flexShrink: 0,
              background: isConfirmed
                ? "var(--danger-bg)"
                : "var(--suspected-bg)",
              color: isConfirmed ? "var(--danger)" : "var(--suspected)",
              border: `1px solid ${isConfirmed ? "rgba(220,38,38,0.12)" : "rgba(202,138,4,0.12)"}`,
            }}
          >
            {cap}
          </span>
        ))}
        <span
          style={{
            fontSize: "0.84rem",
            fontWeight: 600,
            color: "var(--text)",
            lineHeight: 1.4,
            flex: 1,
          }}
        >
          {finding.problem}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.55rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "1px 6px",
            borderRadius: 3,
            flexShrink: 0,
            background: isConfirmed
              ? "var(--danger-bg)"
              : "var(--suspected-bg)",
            color: isConfirmed ? "var(--danger)" : "var(--suspected)",
          }}
        >
          {finding.confidence}
        </span>
      </div>

      {/* Always visible: description + file link */}
      <div
        style={{
          padding: "6px 20px 0",
          fontSize: "0.78rem",
          color: "var(--text-dim)",
          lineHeight: 1.6,
        }}
      >
        {finding.evidence
          ? finding.evidence.length > 200
            ? finding.evidence.slice(0, 200) + "..."
            : finding.evidence
          : finding.problem}
      </div>
      {finding.fileLine && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            const file = finding.fileLine.split(":")[0];
            if (file) {
              selectFile(file);
              onShowCode();
            }
          }}
          style={{
            padding: "6px 20px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: "0.68rem",
            color: "var(--accent-light)",
            cursor: "pointer",
            display: "inline-block",
          }}
        >
          → {finding.fileLine}
        </div>
      )}

      {/* Expandable: proof box */}
      <div
        className={`proof-area${isExpanded ? " open" : ""}`}
      >
        <div
          style={{
            margin: "0 20px 14px",
            padding: "12px 14px",
            background: "var(--bg-code)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          {finding.evidence && (
            <>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.55rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--text-muted)",
                  marginBottom: 4,
                }}
              >
                Evidence
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-dim)",
                  lineHeight: 1.6,
                }}
              >
                {finding.evidence}
              </div>
            </>
          )}
          {finding.reproductionStrategy && (
            <>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.55rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--text-muted)",
                  marginBottom: 4,
                  marginTop: finding.evidence ? 10 : 0,
                }}
              >
                Reproduction
              </div>
              <div
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text-dim)",
                  lineHeight: 1.7,
                  fontFamily: "var(--font-mono)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {finding.reproductionStrategy}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ResultsPanel({
  onShowCode,
}: {
  onShowCode: () => void;
}) {
  const findings = useAuditStore((s) => s.findings);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div
        className="flex items-center shrink-0"
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span className="section-header">
          Findings
        </span>
        {findings.length > 0 && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.65rem",
              color: "var(--text-muted)",
              marginLeft: 8,
            }}
          >
            {findings.length}
          </span>
        )}
        <button
          onClick={onShowCode}
          className="btn-ghost"
          style={{ marginLeft: "auto", padding: "4px 10px" }}
        >
          view source
        </button>
      </div>

      {/* Findings list */}
      <div className="flex-1 overflow-y-auto">
        {findings.map((f, i) => (
          <FindingCard
            key={i}
            finding={f}
            isExpanded={expandedIndex === i}
            onToggle={() =>
              setExpandedIndex(expandedIndex === i ? null : i)
            }
            onShowCode={onShowCode}
          />
        ))}

        {findings.length === 0 && (
          <div
            className="flex flex-col items-center justify-center gap-2"
            style={{
              padding: "48px 20px",
              color: "var(--text-muted)",
              fontSize: "0.85rem",
            }}
          >
            <div style={{ fontSize: "2rem", opacity: 0.3 }}>&#10003;</div>
            No suspicious behavior detected
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.7rem",
              }}
            >
              Package appears safe to install
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
