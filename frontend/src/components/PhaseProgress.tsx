import { useAuditStore } from "../stores/auditStore";

export function PhaseProgress() {
  const phases = useAuditStore((s) => s.phases);
  const done = phases.filter((p) => p.status === "done").length;

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-[3px] items-center">
        {phases.map((p) => (
          <div
            key={p.name}
            className={p.status === "active" ? "animate-pulse-blue" : ""}
            style={{
              width: 16,
              height: 3,
              borderRadius: 2,
              background:
                p.status === "done"
                  ? "var(--safe)"
                  : p.status === "active"
                    ? "var(--investigating)"
                    : "var(--pending)",
            }}
          />
        ))}
      </div>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.7rem",
          color: "var(--text-muted)",
        }}
      >
        {done} / {phases.length}
      </span>
    </div>
  );
}
