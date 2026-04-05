import { FileTree } from "./FileTree";
import { useAuditStore } from "../stores/auditStore";

export function FileExplorer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const files = useAuditStore((s) => s.files);

  return (
    <div
      className="flex flex-col shrink-0 overflow-hidden"
      style={{
        width: open ? "var(--explorer-width)" : 0,
        minWidth: open ? "var(--explorer-width)" : 0,
        borderLeft: open ? "1px solid var(--border)" : "none",
        transition: "width 0.25s ease, min-width 0.25s ease",
      }}
    >
      <div
        className="section-header flex items-center justify-between shrink-0"
        style={{
          padding: "10px 14px 8px",
          borderBottom: "1px solid var(--border)",
          whiteSpace: "nowrap",
        }}
      >
        Files ({files.length})
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            fontSize: "0.75rem",
            padding: "0 2px",
            lineHeight: 1,
          }}
          aria-label="Close file explorer"
        >
          &times;
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <FileTree />
      </div>
    </div>
  );
}
