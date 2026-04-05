import { useState } from "react";
import { useAuditStore } from "../stores/auditStore";

export function Landing() {
  const [input, setInput] = useState("");
  const [version, setVersion] = useState("");
  const startAudit = useAuditStore((s) => s.startAudit);
  const error = useAuditStore((s) => s.error);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) startAudit(input.trim(), version.trim() || undefined);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8">
      <h1
        className="text-center leading-[1.1]"
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: "clamp(2.2rem, 5vw, 4rem)",
          letterSpacing: "-0.03em",
        }}
      >
        Know what
        <br />
        you install
        <span style={{ color: "var(--text-muted)" }}>.</span>
      </h1>
      <p
        className="text-center max-w-[360px] leading-[1.7]"
        style={{ color: "var(--text-dim)", fontSize: "0.95rem" }}
      >
        AI-powered security audit for npm packages. Results published on-chain.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-[440px]">
        <label className="sr-only" htmlFor="pkg-input">
          Package name
        </label>
        <input
          id="pkg-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="package name"
          autoFocus
          className="flex-1 outline-none"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius)",
            padding: "10px 16px",
            fontFamily: "var(--font-mono)",
            fontSize: "0.9rem",
            color: "var(--text)",
          }}
        />
        <label className="sr-only" htmlFor="version-input">
          Version
        </label>
        <input
          id="version-input"
          type="text"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="latest"
          className="outline-none"
          style={{
            width: 100,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius)",
            padding: "10px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: "0.9rem",
            color: "var(--text)",
          }}
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            padding: "10px 20px",
            border: "none",
            borderRadius: "var(--radius)",
            background: "var(--accent)",
            color: "#fff",
            fontWeight: 600,
            fontSize: "0.85rem",
            cursor: "pointer",
            letterSpacing: "0.02em",
          }}
        >
          Audit
        </button>
      </form>
      {error && (
        <p style={{ color: "var(--danger)", fontSize: "0.8rem" }} role="alert">
          {error}
        </p>
      )}
      <div
        className="flex gap-3"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.7rem",
          color: "var(--text-muted)",
        }}
      >
        {["event-stream", "ua-parser-js", "colors"].map((pkg) => (
          <button
            key={pkg}
            type="button"
            className="cursor-pointer hover:underline"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              fontFamily: "inherit",
              fontSize: "inherit",
              color: "inherit",
              cursor: "pointer",
              textUnderlineOffset: "2px",
            }}
            aria-label={`Try auditing ${pkg}`}
            onClick={() => {
              setInput(pkg);
              setVersion("");
            }}
          >
            {pkg}
          </button>
        ))}
      </div>
    </div>
  );
}
