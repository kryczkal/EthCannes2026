import { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { EditorView } from "@codemirror/view";
import { useAuditStore } from "../stores/auditStore";
import type { Finding, Proof } from "../lib/types";

function verificationStatus(proof?: Proof) {
  if (!proof) return { label: "FLAGGED", color: "var(--text-muted)", bg: "var(--bg-tertiary)", border: "var(--text-muted)", rank: 5 };
  switch (proof.kind) {
    case "TEST_CONFIRMED": return { label: "VERIFIED", color: "var(--danger)", bg: "var(--danger-bg)", border: "var(--danger)", rank: 0 };
    case "AI_DYNAMIC": return { label: "OBSERVED", color: "var(--suspected)", bg: "var(--suspected-bg)", border: "var(--suspected)", rank: 1 };
    case "TEST_UNCONFIRMED": return { label: "UNVERIFIED", color: "var(--suspected)", bg: "var(--suspected-bg)", border: "var(--suspected)", rank: 2 };
    case "AI_STATIC": return { label: "STATIC ANALYSIS", color: "var(--text-muted)", bg: "var(--bg-tertiary)", border: "var(--text-muted)", rank: 3 };
    case "STRUCTURAL": return { label: "STRUCTURAL", color: "var(--text-dim)", bg: "var(--bg-secondary)", border: "var(--text-dim)", rank: 4 };
  }
}

function FindingCard({
  finding,
  proof,
  isExpanded,
  onToggle,
  onShowCode,
}: {
  finding: Finding;
  proof?: Proof;
  isExpanded: boolean;
  onToggle: () => void;
  onShowCode: () => void;
}) {
  const selectFile = useAuditStore((s) => s.selectFile);

  const caps = finding.capability
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const status = verificationStatus(proof);

  return (
    <div
      onClick={onToggle}
      style={{
        borderBottom: "1px solid var(--border)",
        borderLeft: `3px solid ${status.border}`,
        cursor: "pointer",
        background: isExpanded ? "var(--bg-secondary)" : undefined,
        transition: "background 0.15s",
      }}
    >
      {/* Header: problem title + verification badge */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          padding: "14px 20px 0",
        }}
      >
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
            background: status.bg,
            color: status.color,
          }}
        >
          {status.label === "VERIFIED" ? "✓ " : ""}{status.label}
        </span>
      </div>

      {/* Capability tags — neutral, not severity indicators */}
      <div style={{ padding: "4px 20px 0", display: "flex", gap: 6 }}>
        {caps.map((cap) => (
          <span
            key={cap}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6rem",
              fontWeight: 600,
              padding: "1px 6px",
              borderRadius: 3,
              letterSpacing: "0.03em",
              background: "var(--bg-tertiary)",
              color: "var(--text-dim)",
              border: "1px solid var(--border)",
            }}
          >
            {cap}
          </span>
        ))}
      </div>

      {/* Evidence + file link */}
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
          {proof?.attackPathway && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.6rem",
                color: "var(--text-muted)",
                marginBottom: 8,
                letterSpacing: "0.05em",
              }}
            >
              ATTACK PATHWAY · {proof.attackPathway.replace(/_/g, " ")}
            </div>
          )}
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

        {/* Generated exploit test code */}
        {proof?.testCode && (
          <div
            style={{
              margin: "0 20px 14px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                background: "var(--bg-tertiary)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-dim)",
                }}
              >
                Exploit Test
              </span>
              {proof.kind === "TEST_CONFIRMED" && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.55rem",
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 3,
                    background: "var(--danger-bg)",
                    color: "var(--danger)",
                  }}
                >
                  ✓ VERIFIED
                </span>
              )}
              {proof.kind === "TEST_UNCONFIRMED" && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.55rem",
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 3,
                    background: "var(--suspected-bg)",
                    color: "var(--suspected)",
                  }}
                >
                  UNCONFIRMED
                </span>
              )}
              {proof.testHash && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.55rem",
                    color: "var(--text-muted)",
                  }}
                >
                  #{proof.testHash.slice(0, 8)}
                </span>
              )}
            </div>
            <div style={{ maxHeight: 300, overflow: "auto" }}>
              <CodeMirror
                value={proof.testCode}
                extensions={[
                  javascript({ jsx: false, typescript: false }),
                  EditorView.editable.of(false),
                ]}
                basicSetup={{
                  lineNumbers: false,
                  foldGutter: false,
                  highlightActiveLine: false,
                }}
                style={{ fontSize: "0.72rem" }}
              />
            </div>
          </div>
        )}
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
  const proofs = useAuditStore((s) => s.proofs);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Match each finding to a proof by fileLine (natural join key)
  const proofByFileLine = Object.fromEntries(proofs.map((p) => [p.fileLine, p]));

  // Sort findings: verified threats first, then observed, unverified, static, flagged
  const sortedFindings = [...findings]
    .map((f, i) => ({ finding: f, originalIndex: i, rank: verificationStatus(proofByFileLine[f.fileLine]).rank }))
    .sort((a, b) => a.rank - b.rank);

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

      {/* Findings list — sorted by verification status */}
      <div className="flex-1 overflow-y-auto">
        {sortedFindings.map(({ finding: f, originalIndex }) => (
          <FindingCard
            key={originalIndex}
            finding={f}
            proof={proofByFileLine[f.fileLine]}
            isExpanded={expandedIndex === originalIndex}
            onToggle={() =>
              setExpandedIndex(expandedIndex === originalIndex ? null : originalIndex)
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
