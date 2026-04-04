import { useAuditStore } from "../stores/auditStore";

const PHASE_LABELS: Record<string, string> = {
  resolve: "Resolve",
  inventory: "Inventory",
  triage: "Triage",
  investigation: "Investigate",
  "test-gen": "Test Gen",
  verify: "Verify",
};

export function PhaseProgress() {
  const phases = useAuditStore((s) => s.phases);
  const riskScore = useAuditStore((s) => s.riskScore);

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
      {phases.map((p, i) => (
        <div key={p.name} className="flex items-center">
          {i > 0 && (
            <div className={`w-6 h-px mx-1 ${
              p.status !== "pending" ? "bg-[var(--color-investigating)]" : "bg-[var(--color-border)]"
            }`} />
          )}
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${
              p.status === "done" ? "bg-[var(--color-safe)]" :
              p.status === "active" ? "bg-[var(--color-investigating)] animate-pulse-blue" :
              "bg-[var(--color-pending)]"
            }`} />
            <span className={`text-[10px] uppercase tracking-wider ${
              p.status === "active" ? "text-[var(--color-investigating)]" :
              p.status === "done" ? "text-[var(--color-text-dim)]" :
              "text-[var(--color-pending)]"
            }`}>
              {PHASE_LABELS[p.name] || p.name}
            </span>
            {p.durationMs !== undefined && (
              <span className="text-[9px] text-[var(--color-pending)]">
                {p.durationMs < 1000 ? `${p.durationMs}ms` : `${(p.durationMs / 1000).toFixed(1)}s`}
              </span>
            )}
          </div>
        </div>
      ))}
      {riskScore !== null && (
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">Risk</span>
          <span className={`text-sm font-bold ${
            riskScore >= 7 ? "text-[var(--color-danger)]" :
            riskScore >= 3 ? "text-[var(--color-suspected)]" :
            "text-[var(--color-safe)]"
          }`}>
            {riskScore}/10
          </span>
        </div>
      )}
    </div>
  );
}
