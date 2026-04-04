import { useEffect, useState } from "react";
import { useAuditStore } from "../stores/auditStore";

export function VerdictBanner() {
  const verdict = useAuditStore((s) => s.verdict);
  const capabilities = useAuditStore((s) => s.capabilities);
  const proofCount = useAuditStore((s) => s.proofCount);
  const findings = useAuditStore((s) => s.findings);

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

  const isDangerous = verdict === "DANGEROUS";

  return (
    <div
      className="animate-slide-down flex items-center gap-4 shrink-0"
      style={{
        padding: "12px 28px",
        borderTop: `2px solid ${isDangerous ? "var(--danger)" : "var(--safe)"}`,
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
            color: isDangerous ? "var(--danger)" : "var(--safe)",
          }}
        >
          {verdict}
        </span>
      )}

      {/* Stats */}
      {stage >= 2 && (
        <span
          className="fade-in"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.72rem",
            color: "var(--text-dim)",
          }}
        >
          {proofCount} proof{proofCount !== 1 ? "s" : ""} · {findings.length}{" "}
          finding{findings.length !== 1 ? "s" : ""}
        </span>
      )}

      {/* Capability tags */}
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
                border: `1px solid ${isDangerous ? "var(--danger)" : "var(--safe)"}`,
                color: isDangerous ? "var(--danger)" : "var(--safe)",
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
