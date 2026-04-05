import { useEffect, useCallback } from "react";
import { useAuditStore } from "./stores/auditStore";
import { Header } from "./components/Header";
import { Landing } from "./components/Landing";
import { AuditView } from "./components/AuditView";

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
  }, [auditId, connectToSession]);

  // Update URL when an audit starts from the landing page
  useEffect(() => {
    if (auditId && !window.location.pathname.includes(auditId)) {
      history.pushState(null, "", `/audit/${auditId}`);
    }
  }, [auditId]);

  // Handle browser back/forward
  const onPopState = useCallback(() => {
    const match = window.location.pathname.match(/^\/audit\/([0-9a-f-]{36})$/);
    if (match) {
      if (match[1] !== auditId) connectToSession(match[1]);
    } else {
      reset();
    }
  }, [auditId, connectToSession, reset]);

  useEffect(() => {
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [onPopState]);

  return (
    <div
      className="h-screen flex flex-col"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <Header />
      <main className="flex-1 flex flex-col min-h-0">
        {hasAudit ? <AuditView /> : <Landing />}
      </main>
    </div>
  );
}

export default App;
