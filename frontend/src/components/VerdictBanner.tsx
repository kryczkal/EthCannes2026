import { useAuditStore } from "../stores/auditStore";

export function VerdictBanner() {
  const verdict = useAuditStore((s) => s.verdict);
  const capabilities = useAuditStore((s) => s.capabilities);
  const proofCount = useAuditStore((s) => s.proofCount);
  const findings = useAuditStore((s) => s.findings);

  if (!verdict) return null;

  const isDangerous = verdict === "DANGEROUS";

  return (
    <div className={`animate-slide-down ${isDangerous ? "glow-danger" : "glow-safe"}`}>
      <div className={`px-4 py-3 flex items-center gap-4 ${
        isDangerous
          ? "bg-[var(--color-danger)]/10 border-b-2 border-[var(--color-danger)]"
          : "bg-[var(--color-safe)]/10 border-b-2 border-[var(--color-safe)]"
      }`}>
        {/* Verdict */}
        <div className={`text-2xl font-black tracking-widest ${
          isDangerous ? "text-[var(--color-danger)]" : "text-[var(--color-safe)]"
        }`}>
          {verdict}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs">
          {proofCount > 0 && (
            <span className="text-[var(--color-text-dim)]">
              <span className="text-[var(--color-danger)] font-bold">{proofCount}</span> proof{proofCount !== 1 ? "s" : ""}
            </span>
          )}
          {findings.length > 0 && (
            <span className="text-[var(--color-text-dim)]">
              <span className="text-[var(--color-suspected)] font-bold">{findings.length}</span> finding{findings.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Capabilities */}
        {capabilities.length > 0 && (
          <div className="flex gap-1 flex-wrap ml-auto">
            {capabilities.map((cap) => (
              <span key={cap} className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--color-danger)]/30 text-[var(--color-danger)] bg-[var(--color-danger)]/10">
                {cap}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
