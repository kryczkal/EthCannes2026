import { useMemo, useState, useEffect, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { EditorView, Decoration } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { useAuditStore } from "../stores/auditStore";
import { parseLineRanges } from "../lib/types";

function createHighlightExtension(ranges: Array<[number, number]>) {
  const lineDeco = Decoration.line({ class: "cm-suspicious-line" });

  return EditorView.decorations.compute(["doc"], (state) => {
    if (ranges.length === 0) return Decoration.none;
    const builder = new RangeSetBuilder<Decoration>();
    for (const [startLine, endLine] of ranges) {
      for (
        let line = startLine;
        line <= endLine && line <= state.doc.lines;
        line++
      ) {
        const lineObj = state.doc.line(line);
        builder.add(lineObj.from, lineObj.from, lineDeco);
      }
    }
    return builder.finish();
  });
}

// CodeMirror theme overrides are applied via CSS custom properties in index.css

export function CodeViewer({
  onToggleFiles,
  filesOpen,
  onShowResults,
}: {
  onToggleFiles: () => void;
  filesOpen: boolean;
  onShowResults?: () => void;
}) {
  const selectedFile = useAuditStore((s) => s.selectedFile);
  const content = useAuditStore((s) => s.selectedFileContent);
  const fileVerdicts = useAuditStore((s) => s.fileVerdicts);
  const verdict = useAuditStore((s) => s.verdict);
  const isRunning = useAuditStore((s) => s.isRunning);
  const phase = useAuditStore((s) => s.phase);
  const selectFile = useAuditStore((s) => s.selectFile);

  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  // Track recent files (adjust state during render)
  const [prevSelectedFile, setPrevSelectedFile] = useState(selectedFile);
  if (selectedFile && selectedFile !== prevSelectedFile) {
    setPrevSelectedFile(selectedFile);
    if (!recentFiles.includes(selectedFile)) {
      setRecentFiles((prev) => [selectedFile, ...prev].slice(0, 4));
    }
  }

  const fileVerdict = selectedFile ? fileVerdicts[selectedFile] : null;

  const suspiciousRanges = useMemo(() => {
    if (!fileVerdict) return [];
    return parseLineRanges(fileVerdict.suspiciousLines);
  }, [fileVerdict]);

  const extensions = useMemo(
    () => [
      javascript({ jsx: true, typescript: true }),
      EditorView.editable.of(false),
      createHighlightExtension(suspiciousRanges),
    ],
    [suspiciousRanges],
  );

  // Trigger scanner animation when content loads (adjust state during render)
  const scannerKey = selectedFile && content !== null ? selectedFile : null;
  const [prevScannerKey, setPrevScannerKey] = useState(scannerKey);
  if (scannerKey && scannerKey !== prevScannerKey) {
    setPrevScannerKey(scannerKey);
    setShowScanner(true);
  }

  // Timer to end scanner sweep + auto-scroll to suspicious lines
  useEffect(() => {
    if (!showScanner) return;
    const t = setTimeout(() => {
      setShowScanner(false);
      if (suspiciousRanges.length > 0 && editorRef.current?.view) {
        const view = editorRef.current.view;
        const line = suspiciousRanges[0][0];
        if (line <= view.state.doc.lines) {
          const lineObj = view.state.doc.line(line);
          view.dispatch({
            effects: EditorView.scrollIntoView(lineObj.from, { y: "center" }),
          });
        }
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [showScanner, suspiciousRanges]);

  const resultsBtn = onShowResults ? (
    <button
      onClick={onShowResults}
      className="btn-ghost"
      style={{
        borderColor: "var(--danger)",
        color: "var(--danger)",
      }}
    >
      results
    </button>
  ) : null;

  const filesToggleBtn = (
    <button
      onClick={onToggleFiles}
      className="btn-ghost"
      style={{
        borderColor: filesOpen ? "var(--accent)" : undefined,
        color: filesOpen ? "var(--accent)" : undefined,
      }}
    >
      files
    </button>
  );

  // Empty state — safe verdict
  if (!selectedFile && verdict === "SAFE") {
    return (
      <div className="h-full flex flex-col">
        <div
          className="flex items-center gap-2 shrink-0"
          style={{
            padding: "8px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="flex-1" />
          {resultsBtn}
          {filesToggleBtn}
        </div>
        <div
          className="flex-1 flex flex-col items-center justify-center gap-2"
          style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}
        >
          <div style={{ fontSize: "2rem", opacity: 0.3 }}>&#10003;</div>
          No suspicious code found
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>
            All files passed analysis
          </div>
        </div>
      </div>
    );
  }

  // Default empty state
  if (!selectedFile) {
    const isEarlyPhase = isRunning && (!phase || phase === "resolve" || phase === "inventory" || phase === "triage");
    return (
      <div className="h-full flex flex-col">
        <div
          className="flex items-center gap-2 shrink-0"
          style={{
            padding: "8px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="flex-1" />
          {resultsBtn}
          {filesToggleBtn}
        </div>
        <div
          className="flex-1 flex flex-col items-center justify-center gap-2"
          style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}
        >
          {isEarlyPhase ? (
            <>
              <div style={{ fontSize: "2rem", opacity: 0.3 }} className="animate-pulse-blue">{"{ }"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>Waiting for analysis</span>
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <span className="thinking-dot" />
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: "2rem", opacity: 0.3 }}>{"{ }"}</div>
              Select a file to view
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Code nav bar */}
      <div
        className="flex items-center gap-2 shrink-0"
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* File selector */}
        <div
          className="flex items-center gap-1.5"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "4px 10px",
            fontFamily: "var(--font-mono)",
            fontSize: "0.78rem",
          }}
        >
          <div
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: fileVerdict
                ? fileVerdict.riskContribution >= 5
                  ? "var(--danger)"
                  : fileVerdict.riskContribution >= 3
                    ? "var(--suspected)"
                    : "var(--safe)"
                : "var(--pending)",
            }}
          />
          {selectedFile}
        </div>

        {/* File tabs */}
        {recentFiles.length > 1 && (
          <div className="flex gap-0.5 ml-2">
            {recentFiles.map((f) => (
              <button
                key={f}
                onClick={() => selectFile(f)}
                style={{
                  padding: "3px 10px",
                  borderRadius: "var(--radius-sm)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.72rem",
                  color:
                    f === selectedFile ? "var(--text)" : "var(--text-muted)",
                  background:
                    f === selectedFile ? "var(--bg-tertiary)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {f.split("/").pop()}
              </button>
            ))}
          </div>
        )}

        {/* Capability tags */}
        {fileVerdict && fileVerdict.capabilities.length > 0 && (
          <div className="ml-auto flex gap-1">
            {fileVerdict.capabilities.map((cap) => (
              <span
                key={cap}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.6rem",
                  padding: "1px 6px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--danger)",
                  color: "var(--danger)",
                  opacity: 0.7,
                }}
              >
                {cap}
              </span>
            ))}
          </div>
        )}

        {/* Results + Files toggle */}
        <div
          className="flex items-center gap-2"
          style={{
            marginLeft:
              fileVerdict && fileVerdict.capabilities.length > 0
                ? 8
                : "auto",
          }}
        >
          {resultsBtn}
          {filesToggleBtn}
        </div>
      </div>

      {/* Code content with scanner overlay */}
      <div
        className="flex-1 overflow-auto"
        style={{ background: "var(--bg-code)", position: "relative" }}
      >
        {showScanner && <div className="code-scanner-line" />}
        {content === null ? (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: "var(--pending)", fontSize: "0.8rem" }}
          >
            Loading...
          </div>
        ) : (
          <CodeMirror
            ref={editorRef}
            key={selectedFile}
            value={content}
            extensions={extensions}
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLine: false,
            }}
            style={{ fontSize: "0.82rem" }}
          />
        )}
      </div>

      {/* Suspicious patterns */}
      {fileVerdict && fileVerdict.suspiciousPatterns.length > 0 && (
        <div
          className="shrink-0"
          style={{
            borderTop: "1px solid var(--border)",
            background: "var(--bg-secondary)",
            maxHeight: 120,
            overflowY: "auto",
          }}
        >
          {fileVerdict.suspiciousPatterns.map((pattern, i) => {
            const lineMatch = pattern.match(/L(\d+)/);
            const lineNum = lineMatch ? parseInt(lineMatch[1], 10) : null;
            return (
              <div
                key={i}
                onClick={() => {
                  if (lineNum && editorRef.current?.view) {
                    const view = editorRef.current.view;
                    if (lineNum <= view.state.doc.lines) {
                      const lineObj = view.state.doc.line(lineNum);
                      view.dispatch({
                        effects: EditorView.scrollIntoView(lineObj.from, { y: "center" }),
                      });
                    }
                  }
                }}
                style={{
                  padding: "4px 16px",
                  fontSize: "0.72rem",
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-dim)",
                  cursor: lineNum ? "pointer" : "default",
                  borderBottom: i < fileVerdict.suspiciousPatterns.length - 1
                    ? "1px solid var(--border)"
                    : undefined,
                  display: "flex",
                  gap: 8,
                }}
              >
                <span style={{ color: "var(--suspected)", flexShrink: 0 }}>&gt;</span>
                <span>
                  {pattern.replace(/^L[\d,\s\-]+:?\s*/, "")}
                </span>
                {lineMatch && (
                  <span style={{ color: "var(--accent-light)", flexShrink: 0, marginLeft: "auto" }}>
                    {lineMatch[0]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Verdict summary footer */}
      {fileVerdict && fileVerdict.summary && (
        <div
          className="shrink-0"
          style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--border)",
            fontSize: "0.78rem",
            color: "var(--text-dim)",
          }}
        >
          {fileVerdict.summary}
        </div>
      )}
    </div>
  );
}
