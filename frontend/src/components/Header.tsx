import { useAuditStore } from "../stores/auditStore";
import { PhaseProgress } from "./PhaseProgress";

export function Header() {
  const isRunning = useAuditStore((s) => s.isRunning);
  const packageName = useAuditStore((s) => s.packageName);
  const verdict = useAuditStore((s) => s.verdict);
  const reset = useAuditStore((s) => s.reset);

  const statusColor = verdict
    ? verdict === "DANGEROUS"
      ? "var(--danger)"
      : "var(--safe)"
    : "var(--investigating)";

  const goHome = () => {
    reset();
    history.pushState(null, "", "/");
  };

  return (
    <header
      className="flex items-center gap-5 shrink-0"
      style={{
        padding: "0 28px",
        height: "var(--header-height)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <button
        onClick={goHome}
        aria-label="Go to home page"
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: "1rem",
          letterSpacing: "-0.02em",
          cursor: "pointer",
          background: "none",
          border: "none",
          padding: 0,
          color: "inherit",
        }}
      >
        npm<span style={{ color: "var(--accent)" }}>guard</span>
      </button>

      {(isRunning || verdict) && (
        <div
          className="flex items-center gap-2"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            padding: "4px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: "0.8rem",
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: statusColor,
            }}
          />
          {packageName}
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        {(isRunning || verdict) && <PhaseProgress />}
        <button
          onClick={() =>
            document.documentElement.classList.toggle("urushi")
          }
          className="flex items-center gap-1"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: "0.7rem",
            color: "var(--text-muted)",
            padding: 0,
          }}
          aria-label="Toggle theme"
        >
          <div
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "var(--accent)",
            }}
          />
        </button>
      </div>
    </header>
  );
}
