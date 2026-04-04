import { useMemo, useState } from "react";
import { useAuditStore } from "../stores/auditStore";
import type { FileRecord, FileStatus } from "../lib/types";

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  file?: FileRecord;
}

function buildTree(files: FileRecord[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", isDir: true, children: [] };

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const childPath = parts.slice(0, i + 1).join("/");

      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          path: childPath,
          isDir: !isLast,
          children: [],
          file: isLast ? file : undefined,
        };
        current.children.push(child);
      }
      current = child;
    }
  }

  // Sort: directories first, then alphabetically
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) sort(n.children);
  };
  sort(root.children);

  return root.children;
}

const STATUS_COLORS: Record<FileStatus, string> = {
  pending: "bg-[var(--color-pending)]",
  analyzing: "bg-[var(--color-investigating)] animate-pulse-blue",
  safe: "bg-[var(--color-safe)]",
  suspicious: "bg-[var(--color-suspected)]",
  dangerous: "bg-[var(--color-danger)]",
};

function TreeNodeComponent({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(true);
  const selectedFile = useAuditStore((s) => s.selectedFile);
  const fileStatuses = useAuditStore((s) => s.fileStatuses);
  const fileVerdicts = useAuditStore((s) => s.fileVerdicts);
  const selectFile = useAuditStore((s) => s.selectFile);

  const status = fileStatuses[node.path] as FileStatus | undefined;
  const verdict = fileVerdicts[node.path];
  const isSelected = selectedFile === node.path;

  // For directories, compute aggregate status
  const dirStatus = useMemo(() => {
    if (!node.isDir) return null;
    const prefix = node.path + "/";
    const childStatuses = Object.entries(fileStatuses)
      .filter(([path]) => path.startsWith(prefix))
      .map(([, s]) => s);
    if (childStatuses.some((s) => s === "dangerous")) return "dangerous";
    if (childStatuses.some((s) => s === "suspicious")) return "suspicious";
    if (childStatuses.some((s) => s === "analyzing")) return "analyzing";
    if (childStatuses.every((s) => s === "safe")) return "safe";
    return "pending";
  }, [node.isDir, node.path, fileStatuses]);

  const effectiveStatus = node.isDir ? dirStatus : status;

  return (
    <div>
      <div
        role={node.isDir ? "treeitem" : "treeitem"}
        aria-expanded={node.isDir ? expanded : undefined}
        aria-selected={isSelected}
        tabIndex={0}
        className={`flex items-center gap-1.5 px-2 py-0.5 cursor-pointer hover:bg-[var(--color-bg-secondary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-investigating)] ${
          isSelected ? "bg-[var(--color-bg-secondary)]" : ""
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (node.isDir) {
            setExpanded(!expanded);
          } else {
            selectFile(node.path);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (node.isDir) {
              setExpanded(!expanded);
            } else {
              selectFile(node.path);
            }
          }
        }}
      >
        {/* Status dot */}
        {effectiveStatus && (
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[effectiveStatus as FileStatus] || ""}`} />
        )}
        {!effectiveStatus && <div className="w-1.5 h-1.5 shrink-0" />}

        {/* Icon */}
        <span className="text-[var(--color-text-dim)] text-[11px] w-4 text-center shrink-0">
          {node.isDir ? (expanded ? "v" : ">") : " "}
        </span>

        {/* Name */}
        <span className={`text-xs truncate ${
          isSelected ? "text-[var(--color-text)]" :
          effectiveStatus === "dangerous" ? "text-[var(--color-danger)]" :
          effectiveStatus === "suspicious" ? "text-[var(--color-suspected)]" :
          "text-[var(--color-text-dim)]"
        }`}>
          {node.name}
        </span>

        {/* Risk badge */}
        {verdict && verdict.riskContribution >= 3 && (
          <span className={`ml-auto text-[9px] px-1 rounded ${
            verdict.riskContribution >= 5 ? "bg-[var(--color-danger)]/20 text-[var(--color-danger)]" :
            "bg-[var(--color-suspected)]/20 text-[var(--color-suspected)]"
          }`}>
            {verdict.riskContribution}
          </span>
        )}
      </div>

      {node.isDir && expanded && node.children.map((child) => (
        <TreeNodeComponent key={child.path} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function FileTree() {
  const files = useAuditStore((s) => s.files);
  const tree = useMemo(() => buildTree(files), [files]);

  if (files.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--color-pending)] text-xs">
        Waiting for package...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto py-1" role="tree" aria-label="Package files">
      {tree.map((node) => (
        <TreeNodeComponent key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
}
