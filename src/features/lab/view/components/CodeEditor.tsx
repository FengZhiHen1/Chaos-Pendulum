import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { python } from "@codemirror/lang-python";

interface CodeEditorProps {
  value: string;
  onChange?: (code: string) => void;
  errorLine?: number | null;
  height?: number;
}

/**
 * CodeMirror 6 Python 代码编辑器（暗色主题）。
 */
export function CodeEditor({
  value,
  onChange,
  errorLine = null,
  height = 300,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && onChange) {
        onChange(update.state.doc.toString());
      }
    });

    const view = new EditorView({
      doc: value,
      extensions: [
        basicSetup,
        python(),
        updateListener,
        EditorView.theme({
          "&": { backgroundColor: "#0d1117", height: `${height}px` },
          ".cm-gutters": { backgroundColor: "#161b22", color: "#484f58", border: "none" },
          ".cm-activeLineGutter": { backgroundColor: "#1a1f2b" },
        }, { dark: true }),
      ],
      parent: containerRef.current,
    });

    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // height 变更——更新编辑器容器样式（不重建编辑器）
  useEffect(() => {
    const el = containerRef.current?.querySelector(".cm-editor") as HTMLElement | null;
    if (el) el.style.height = `${height}px`;
  }, [height]);

  // 错误行高亮 + 滚动
  useEffect(() => {
    const view = viewRef.current;
    if (!view || errorLine == null || errorLine < 1) return;
    if (errorLine > view.state.doc.lines) return;
    const line = view.state.doc.line(errorLine);
    view.dispatch({ selection: { anchor: line.from } });
    const coords = view.coordsAtPos(line.from);
    if (coords) {
      view.scrollDOM.scrollTo({ top: coords.top - 100, behavior: "smooth" });
    }
  }, [errorLine]);

  // 外部 value 变更（非聚焦时同步）
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.hasFocus) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={containerRef} className="overflow-hidden border border-white/5 rounded-lg" />;
}
