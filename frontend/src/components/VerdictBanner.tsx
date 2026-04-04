import { useAuditStore } from "../stores/auditStore";

export function VerdictBanner() {
  const verdict = useAuditStore((s) => s.verdict);
  const capabilities = useAuditStore((s) => s.capabilities);
  const proofCount = useAuditStore((s) => s.proofCount);
  const findings = useAuditStore((s) => s.findings);

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
      <span
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

      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.72rem",
          color: "var(--text-dim)",
        }}
      >
        {proofCount} proof{proofCount !== 1 ? "s" : ""} · {findings.length}{" "}
        finding{findings.length !== 1 ? "s" : ""}
      </span>

      {capabilities.length > 0 && (
        <div className="ml-auto flex gap-1">
          {capabilities.map((cap) => (
            <span
              key={cap}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.6rem",
                padding: "1px 6px",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${isDangerous ? "var(--danger)" : "var(--safe)"}`,
                color: isDangerous ? "var(--danger)" : "var(--safe)",
                opacity: 0.7,
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
