import { useEffect, useState } from "react";
import { useAuditStore } from "../stores/auditStore";

export function VerdictBanner() {
  const verdict = useAuditStore((s) => s.verdict);
  const capabilities = useAuditStore((s) => s.capabilities);
  const findings = useAuditStore((s) => s.findings);
  const proofs = useAuditStore((s) => s.proofs);

  const dealbreaker = proofs.find(
    (p) => p.kind === "STRUCTURAL" && p.evidence?.startsWith("Dealbreaker:")
  );

  // Staged reveal: 0=hidden, 1=verdict word, 2=stats, 3=caps
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!verdict) return;
    const t1 = setTimeout(() => setStage(1), 300);
    const t2 = setTimeout(() => setStage(2), 800);
    const t3 = setTimeout(() => setStage(3), 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [verdict]);

  if (!verdict) return null;

  // Compute verification-aware presentation
  const proofByFileLine = Object.fromEntries(proofs.map(p => [p.fileLine, p]));
  const verified = findings.filter(f => proofByFileLine[f.fileLine]?.kind === "TEST_CONFIRMED").length;
  const observed = findings.filter(f => proofByFileLine[f.fileLine]?.kind === "AI_DYNAMIC").length;
  const rest = findings.length - verified - observed;

  // Derive display label + color from what was actually proven
  let displayLabel: string;
  let displayColor: string;
  if (verdict === "SAFE") {
    displayLabel = "SAFE";
    displayColor = "var(--safe)";
  } else if (dealbreaker) {
    displayLabel = "DANGEROUS";
    displayColor = "var(--danger)";
  } else if (verified > 0) {
    displayLabel = "DANGEROUS";
    displayColor = "var(--danger)";
  } else if (observed > 0) {
    displayLabel = "SUSPICIOUS";
    displayColor = "var(--suspected)";
  } else {
    displayLabel = "REVIEW";
    displayColor = "var(--text-muted)";
  }

  let statsText: string;
  if (dealbreaker) {
    statsText = `DEALBREAKER: ${dealbreaker.problem}`;
  } else if (verified > 0) {
    statsText = `${verified} verified${rest > 0 ? ` · ${rest} flagged` : ""}`;
  } else if (observed > 0) {
    statsText = `${observed} observed · ${rest} unverified`;
  } else if (findings.length > 0) {
    statsText = `${findings.length} flagged · none verified`;
  } else {
    statsText = verdict === "SAFE" ? "No issues found" : "Analysis complete";
  }

  return (
    <div
      role="alert"
      className="animate-slide-down flex items-center gap-4 shrink-0"
      style={{
        padding: "12px 28px",
        borderTop: `2px solid ${displayColor}`,
        background: "var(--bg)",
      }}
    >
      {/* Verdict word */}
      {stage >= 1 && (
        <span
          className="verdict-reveal"
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 800,
            fontSize: "1.1rem",
            letterSpacing: "0.04em",
            color: displayColor,
          }}
        >
          {displayLabel}
        </span>
      )}

      {/* Stats */}
      {stage >= 2 && (
        <span
          className="fade-in"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.72rem",
            color: dealbreaker ? "var(--danger)" : "var(--text-dim)",
            fontWeight: dealbreaker ? 700 : 400,
          }}
        >
          {statsText}
        </span>
      )}

      {/* Capability tags — neutral, not severity indicators */}
      {stage >= 3 && capabilities.length > 0 && (
        <div className="ml-auto flex gap-1">
          {capabilities.map((cap, i) => (
            <span
              key={cap}
              className="cap-pop"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.6rem",
                padding: "1px 6px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                color: "var(--text-dim)",
                opacity: 0,
                animationDelay: `${i * 150}ms`,
                animationFillMode: "forwards",
              }}
            >
              {cap}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
