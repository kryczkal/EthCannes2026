import { useEffect, useRef, useState } from "react";
import { useAuditStore } from "../stores/auditStore";

export function PhaseProgress() {
  const phases = useAuditStore((s) => s.phases);
  const triageProgress = useAuditStore((s) => s.triageProgress);
  const done = phases.filter((p) => p.status === "done").length;

  // Track phase celebrations
  const [celebrating, setCelebrating] = useState<string | null>(null);
  const prevPhases = useRef(phases.map((p) => p.status));

  useEffect(() => {
    const newlyDone = phases.find(
      (p, i) => p.status === "done" && prevPhases.current[i] !== "done",
    );
    prevPhases.current = phases.map((p) => p.status);
    if (newlyDone) {
      setCelebrating(newlyDone.name);
      const t = setTimeout(() => setCelebrating(null), 400);
      return () => clearTimeout(t);
    }
  }, [phases]);

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-[3px] items-center">
        {phases.map((p) => (
          <div
            key={p.name}
            className={
              p.status === "active"
                ? "animate-pulse-blue"
                : p.name === celebrating
                  ? "phase-pip-pop"
                  : ""
            }
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
        {triageProgress
          ? `${triageProgress.current}/${triageProgress.total} files`
          : `${done} / ${phases.length}`}
      </span>
    </div>
  );
}
