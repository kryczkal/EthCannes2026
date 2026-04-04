import { useState } from "react";
import { useAuditStore } from "../stores/auditStore";

export function AuditForm() {
  const [input, setInput] = useState("");
  const startAudit = useAuditStore((s) => s.startAudit);
  const isRunning = useAuditStore((s) => s.isRunning);
  const packageName = useAuditStore((s) => s.packageName);
  const error = useAuditStore((s) => s.error);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isRunning) {
      startAudit(input.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
      <div className="text-[var(--color-investigating)] font-bold text-sm tracking-wider">NPMGUARD</div>
      <label className="flex-1 flex items-center gap-2">
        <span className="text-[var(--color-text-dim)]" aria-hidden="true">$</span>
        <span className="sr-only">Package name to audit</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="package-name"
          disabled={isRunning}
          className="flex-1 bg-transparent border-none outline-none text-[var(--color-text)] placeholder:text-[var(--color-pending)] font-[var(--font-mono)] text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={isRunning || !input.trim()}
        className="px-4 py-1.5 text-xs font-bold tracking-wider border border-[var(--color-border)] rounded hover:border-[var(--color-investigating)] hover:text-[var(--color-investigating)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        {isRunning ? "SCANNING..." : "SCAN"}
      </button>
      {isRunning && packageName && (
        <span className="text-[var(--color-text-dim)] text-xs">
          auditing <span className="text-[var(--color-investigating)]">{packageName}</span>
        </span>
      )}
      {error && (
        <span className="text-[var(--color-danger)] text-xs" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
