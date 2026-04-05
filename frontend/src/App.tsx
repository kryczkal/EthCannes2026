import { useState, useEffect, useRef } from "react";
import { useAuditStore } from "./stores/auditStore";
import { PhaseProgress } from "./components/PhaseProgress";
import { ActivityFeed } from "./components/ActivityFeed";
import { CodeViewer } from "./components/CodeViewer";
import { VerdictBanner } from "./components/VerdictBanner";
import { FileExplorer } from "./components/FileExplorer";
import { ResultsPanel } from "./components/ResultsPanel";

function Landing() {
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
          <span
            key={pkg}
            className="cursor-pointer hover:underline"
            style={{ textUnderlineOffset: "2px" }}
            onClick={() => {
              setInput(pkg);
              setVersion("");
            }}
          >
            {pkg}
          </span>
        ))}
      </div>
    </div>
  );
}

function Header() {
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
        height: 52,
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        onClick={goHome}
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: "1rem",
          letterSpacing: "-0.02em",
          cursor: "pointer",
        }}
      >
        npm<span style={{ color: "var(--accent)" }}>guard</span>
      </div>

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

function AuditView() {
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const verdict = useAuditStore((s) => s.verdict);

  // Auto-switch to results when verdict arrives
  const prevVerdict = useRef(verdict);
  useEffect(() => {
    if (verdict && !prevVerdict.current) {
      setShowResults(true);
    }
    prevVerdict.current = verdict;
  }, [verdict]);

  return (
    <>
      <VerdictBanner />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Activity Feed — left */}
        <div
          className="flex flex-col shrink-0 overflow-hidden"
          style={{
            width: 420,
            minWidth: 420,
            borderRight: "1px solid var(--border)",
          }}
        >
          <ActivityFeed />
        </div>

        {/* Right panel — results or code viewer */}
        <div className="flex-1 flex flex-col min-w-0">
          {showResults && verdict ? (
            <ResultsPanel
              onShowCode={() => setShowResults(false)}
            />
          ) : (
            <CodeViewer
              onToggleFiles={() => setFileExplorerOpen((o) => !o)}
              filesOpen={fileExplorerOpen}
              onShowResults={verdict ? () => setShowResults(true) : undefined}
            />
          )}
        </div>

        {/* File Explorer — right, collapsible */}
        {!showResults && (
          <FileExplorer
            open={fileExplorerOpen}
            onClose={() => setFileExplorerOpen(false)}
          />
        )}
      </div>
    </>
  );
}

function App() {
  const isRunning = useAuditStore((s) => s.isRunning);
  const verdict = useAuditStore((s) => s.verdict);
  const auditId = useAuditStore((s) => s.auditId);
  const connectToSession = useAuditStore((s) => s.connectToSession);
  const reset = useAuditStore((s) => s.reset);
  const hasAudit = isRunning || verdict;

  // On mount: if URL is /audit/<uuid>, reconnect to that session
  useEffect(() => {
    const match = window.location.pathname.match(/^\/audit\/([0-9a-f-]{36})$/);
    if (match && !auditId) {
      connectToSession(match[1]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update URL when an audit starts from the landing page
  useEffect(() => {
    if (auditId && !window.location.pathname.includes(auditId)) {
      history.pushState(null, "", `/audit/${auditId}`);
    }
  }, [auditId]);

  // Handle browser back/forward
  useEffect(() => {
    const onPopState = () => {
      const match = window.location.pathname.match(/^\/audit\/([0-9a-f-]{36})$/);
      if (match) {
        if (match[1] !== auditId) connectToSession(match[1]);
      } else {
        reset();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [auditId, connectToSession, reset]);

  return (
    <div
      className="h-screen flex flex-col"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <Header />
      {hasAudit ? <AuditView /> : <Landing />}
    </div>
  );
}

export default App;
