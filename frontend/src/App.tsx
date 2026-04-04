import { AuditForm } from "./components/AuditForm";
import { PhaseProgress } from "./components/PhaseProgress";
import { FileTree } from "./components/FileTree";
import { CodeViewer } from "./components/CodeViewer";
import { ActivityFeed } from "./components/ActivityFeed";
import { VerdictBanner } from "./components/VerdictBanner";

function App() {
  return (
    <div className="h-screen flex flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* Top bar */}
      <AuditForm />
      <PhaseProgress />
      <VerdictBanner />

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* File tree */}
        <div className="w-[250px] border-r border-[var(--color-border)] bg-[var(--color-bg-tertiary)] shrink-0 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Files
          </div>
          <div className="h-[calc(100%-28px)]">
            <FileTree />
          </div>
        </div>

        {/* Right side: code viewer + activity feed */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Code viewer */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <CodeViewer />
          </div>

          {/* Activity feed */}
          <div className="h-[220px] border-t border-[var(--color-border)] shrink-0 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] flex items-center gap-2">
              <span>Agent Activity</span>
              <span className="ml-auto text-[var(--color-pending)]">auto-follow</span>
            </div>
            <div className="h-[calc(100%-28px)]">
              <ActivityFeed />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
