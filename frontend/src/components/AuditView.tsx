import { useState } from "react";
import { useAuditStore } from "../stores/auditStore";
import { ActivityFeed } from "./ActivityFeed";
import { CodeViewer } from "./CodeViewer";
import { VerdictBanner } from "./VerdictBanner";
import { FileExplorer } from "./FileExplorer";
import { ResultsPanel } from "./ResultsPanel";

export function AuditView() {
  const [fileExplorerOpen, setFileExplorerOpen] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const verdict = useAuditStore((s) => s.verdict);

  // Auto-switch to results when verdict first arrives (adjust state during render)
  const [prevVerdict, setPrevVerdict] = useState(verdict);
  if (verdict !== prevVerdict) {
    setPrevVerdict(verdict);
    if (verdict && !prevVerdict) {
      setShowResults(true);
    }
  }

  return (
    <>
      <VerdictBanner />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Activity Feed — left */}
        <div
          className="flex flex-col shrink-0 overflow-hidden"
          style={{
            width: "var(--sidebar-width)",
            minWidth: "var(--sidebar-width)",
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
