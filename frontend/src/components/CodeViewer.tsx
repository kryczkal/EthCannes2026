import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, Decoration, type DecorationSet, ViewPlugin } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { useAuditStore } from "../stores/auditStore";
import { parseLineRanges } from "../lib/types";

function createHighlightPlugin(ranges: Array<[number, number]>) {
  const lineDeco = Decoration.line({ class: "cm-suspicious-line" });

  return ViewPlugin.define(
    () => ({
      decorations: Decoration.none as DecorationSet,
      update(update: ViewUpdate) {
        // Rebuild on doc change
      },
    }),
    {
      decorations: (instance) => instance.decorations,
      provide: () =>
        EditorView.decorations.compute(["doc"], (state) => {
          if (ranges.length === 0) return Decoration.none;
          const builder = new RangeSetBuilder<Decoration>();
          for (const [startLine, endLine] of ranges) {
            for (let line = startLine; line <= endLine && line <= state.doc.lines; line++) {
              const lineObj = state.doc.line(line);
              builder.add(lineObj.from, lineObj.from, lineDeco);
            }
          }
          return builder.finish();
        }),
    }
  );
}

const suspiciousLineTheme = EditorView.baseTheme({
  ".cm-suspicious-line": {
    backgroundColor: "rgba(248, 81, 73, 0.15) !important",
    borderLeft: "3px solid #f85149",
  },
});

export function CodeViewer() {
  const selectedFile = useAuditStore((s) => s.selectedFile);
  const content = useAuditStore((s) => s.selectedFileContent);
  const fileVerdicts = useAuditStore((s) => s.fileVerdicts);

  const verdict = selectedFile ? fileVerdicts[selectedFile] : null;

  const suspiciousRanges = useMemo(() => {
    if (!verdict) return [];
    return parseLineRanges(verdict.suspiciousLines);
  }, [verdict]);

  const extensions = useMemo(
    () => [
      javascript({ jsx: true, typescript: true }),
      EditorView.editable.of(false),
      suspiciousLineTheme,
      createHighlightPlugin(suspiciousRanges),
    ],
    [suspiciousRanges]
  );

  if (!selectedFile) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--color-pending)] text-xs">
        <div className="text-center">
          <div className="text-2xl mb-2 opacity-30">{"{ }"}</div>
          <div>Select a file to view</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* File header */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <span className="text-xs text-[var(--color-text)]">{selectedFile}</span>
        {verdict && (
          <>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
              verdict.riskContribution >= 5
                ? "bg-[var(--color-danger)]/20 text-[var(--color-danger)]"
                : verdict.riskContribution >= 3
                ? "bg-[var(--color-suspected)]/20 text-[var(--color-suspected)]"
                : "bg-[var(--color-safe)]/20 text-[var(--color-safe)]"
            }`}>
              RISK {verdict.riskContribution}/10
            </span>
            {verdict.capabilities.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {verdict.capabilities.map((cap) => (
                  <span key={cap} className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-text-dim)] border border-[var(--color-border)]">
                    {cap}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Code content */}
      <div className="flex-1 overflow-auto">
        {content === null ? (
          <div className="flex items-center justify-center h-full text-[var(--color-pending)] text-xs">
            Loading...
          </div>
        ) : (
          <CodeMirror
            key={selectedFile}
            value={content}
            theme={oneDark}
            extensions={extensions}
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLine: false,
            }}
            className="text-xs"
          />
        )}
      </div>

      {/* Verdict summary */}
      {verdict && verdict.summary && (
        <div className="px-3 py-1.5 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[10px] text-[var(--color-text-dim)]">
          {verdict.summary}
        </div>
      )}
    </div>
  );
}
