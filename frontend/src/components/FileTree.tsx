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
  pending: "var(--pending)",
  analyzing: "var(--investigating)",
  safe: "var(--safe)",
  suspicious: "var(--suspected)",
  dangerous: "var(--danger)",
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
        role="treeitem"
        aria-expanded={node.isDir ? expanded : undefined}
        aria-selected={isSelected}
        tabIndex={0}
        className={effectiveStatus === "analyzing" ? "animate-pulse-blue" : ""}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: `3px 14px`,
          paddingLeft: node.isDir ? 14 : 14 + depth * 14,
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: "0.74rem",
          color: isSelected ? "var(--text)" : "var(--text-dim)",
          background: isSelected ? "var(--bg-tertiary)" : "transparent",
          whiteSpace: "nowrap",
          transition: "background 0.12s",
        }}
        onMouseEnter={(e) => {
          if (!isSelected)
            (e.currentTarget as HTMLElement).style.background =
              "var(--bg-secondary)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected)
            (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
        onClick={() => {
          if (node.isDir) setExpanded(!expanded);
          else selectFile(node.path);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (node.isDir) setExpanded(!expanded);
            else selectFile(node.path);
          }
        }}
      >
        {node.isDir ? (
          <span
            style={{
              fontSize: "0.55rem",
              color: "var(--text-muted)",
              transition: "transform 0.15s",
              transform: expanded ? "rotate(90deg)" : "none",
              display: "inline-block",
            }}
          >
            &#9656;
          </span>
        ) : (
          <div
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              flexShrink: 0,
              background: effectiveStatus
                ? STATUS_COLORS[effectiveStatus as FileStatus]
                : "var(--pending)",
            }}
          />
        )}
        <span>{node.isDir ? `${node.name}/` : node.name}</span>
        {verdict && verdict.riskContribution >= 3 && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: "0.6rem",
              padding: "0 4px",
              borderRadius: 2,
              fontFamily: "var(--font-mono)",
              background: "var(--danger-bg)",
              color: "var(--danger)",
            }}
          >
            {verdict.riskContribution}
          </span>
        )}
      </div>

      {node.isDir &&
        expanded &&
        node.children.map((child) => (
          <TreeNodeComponent
            key={child.path}
            node={child}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

export function FileTree() {
  const files = useAuditStore((s) => s.files);
  const tree = useMemo(() => buildTree(files), [files]);

  if (files.length === 0) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ color: "var(--pending)", fontSize: "0.75rem" }}
      >
        Waiting for package...
      </div>
    );
  }

  return (
    <div className="py-1" role="tree" aria-label="Package files">
      {tree.map((node) => (
        <TreeNodeComponent key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
}
