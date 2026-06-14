import {
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { sql, MySQL, PostgreSQL } from "@codemirror/lang-sql";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { autocompletion, closeBrackets, completionKeymap, closeBracketsKeymap } from "@codemirror/autocomplete";
import { syntaxHighlighting, defaultHighlightStyle, foldKeymap } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches, openSearchPanel } from "@codemirror/search";
import { lintKeymap } from "@codemirror/lint";
import { useThemeStore } from "../../stores/themeStore";
import type { AutocompleteItem } from "../../lib/tauri";

export interface EditorPaneHandle {
  openSearch(): void;
  getSelectedText(): string;
}

interface EditorPaneProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
  onExecuteAll: () => void;
  readOnly?: boolean;
  dbType?: string;
  autocompleteItems?: AutocompleteItem[];
}

export const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(
  function EditorPane(
    {
      value,
      onChange,
      onExecute,
      onExecuteAll,
      readOnly,
      dbType = "mysql",
      autocompleteItems = [],
    },
    ref,
  ) {
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const { theme } = useThemeStore();

    useImperativeHandle(ref, () => ({
      openSearch: () => {
        if (viewRef.current) {
          viewRef.current.focus();
          openSearchPanel(viewRef.current);
        }
      },
      getSelectedText: () => {
        const view = viewRef.current;
        if (!view) return "";
        const { from, to } = view.state.selection.main;
        return from === to ? "" : view.state.sliceDoc(from, to);
      },
    }));

    const getExtensions = useCallback(() => {
      const dark = theme === "dark";

      // Build schema map for sql() so keyword completion is preserved alongside table/column names.
      // Using override: [...] replaces keyword completion — don't do that.
      const schemaMap: Record<string, string[]> = {};
      for (const item of autocompleteItems) {
        if (item.item_type === "table" || item.item_type === "view") {
          if (!schemaMap[item.name]) schemaMap[item.name] = [];
        } else if (item.item_type === "column" && item.table_name) {
          (schemaMap[item.table_name] ??= []).push(item.name);
        }
      }

      return [
        EditorView.theme(
          {
            "&": {
              backgroundColor: dark ? "#1e1e1e" : "#fff",
              color: dark ? "#d4d4d4" : "#1f2937",
              height: "100%",
            },
            ".cm-content": {
              fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
              fontSize: "13px",
              lineHeight: "1.5",
              padding: "4px 0",
            },
            ".cm-gutters": {
              backgroundColor: dark ? "#252526" : "#f9fafb",
              color: dark ? "#858585" : "#9ca3af",
              borderRight: dark ? "1px solid #333" : "1px solid #e5e7eb",
              minWidth: "40px",
            },
            ".cm-activeLineGutter": { backgroundColor: dark ? "#2a2d2e" : "#e5e7eb" },
            ".cm-activeLine": { backgroundColor: dark ? "#2a2d2e50" : "#f3f4f650" },
            ".cm-cursor": {
              borderLeftColor: dark ? "#aeafad" : "#1f2937",
              borderLeftWidth: "2px",
            },
            ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
              backgroundColor: dark ? "#264f78" : "#dbeafe",
            },
            ".cm-matchingBracket": {
              backgroundColor: dark ? "#3a3f4b" : "#e5e7eb",
              outline: `1px solid ${dark ? "#888" : "#9ca3af"}`,
            },
            ".cm-tooltip": {
              backgroundColor: dark ? "#252526" : "#fff",
              border: `1px solid ${dark ? "#454545" : "#e5e7eb"}`,
              color: dark ? "#d4d4d4" : "#1f2937",
            },
            ".cm-tooltip-autocomplete ul li[aria-selected]": {
              backgroundColor: dark ? "#04395e" : "#dbeafe",
            },
            ".cm-tooltip-autocomplete ul li": { padding: "2px 6px", fontSize: "12px" },
            "&.cm-focused": { outline: "none" },
            ".cm-scroller": {
              fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
            },
            // Search panel styles
            ".cm-panel.cm-search": {
              backgroundColor: dark ? "#252526" : "#f9fafb",
              borderTop: dark ? "1px solid #3c3c3c" : "1px solid #e5e7eb",
              padding: "6px 8px",
              display: "flex",
              flexWrap: "wrap",
              gap: "4px",
              alignItems: "center",
              fontSize: "12px",
              color: dark ? "#d4d4d4" : "#374151",
            },
            ".cm-panel.cm-search input[type=text]": {
              backgroundColor: dark ? "#3c3c3c" : "#fff",
              border: dark ? "1px solid #555" : "1px solid #d1d5db",
              borderRadius: "4px",
              color: dark ? "#d4d4d4" : "#1f2937",
              padding: "2px 6px",
              fontSize: "12px",
              outline: "none",
            },
            ".cm-panel.cm-search input[type=text]:focus": {
              borderColor: dark ? "#4fc3f7" : "#3b82f6",
            },
            ".cm-panel.cm-search input[type=checkbox]": { accentColor: "#3b82f6" },
            ".cm-panel.cm-search button": {
              backgroundColor: dark ? "#3c3c3c" : "#f3f4f6",
              border: dark ? "1px solid #555" : "1px solid #d1d5db",
              borderRadius: "4px",
              color: dark ? "#d4d4d4" : "#374151",
              cursor: "pointer",
              padding: "2px 8px",
              fontSize: "12px",
            },
            ".cm-panel.cm-search button:hover": {
              backgroundColor: dark ? "#4a4a4a" : "#e5e7eb",
            },
            ".cm-panel.cm-search label": {
              color: dark ? "#bbb" : "#6b7280",
              fontSize: "11px",
              display: "flex",
              alignItems: "center",
              gap: "3px",
            },
            ".cm-panel button[name=close]": {
              backgroundColor: "transparent",
              border: "none",
              color: dark ? "#bbb" : "#6b7280",
              cursor: "pointer",
              fontSize: "16px",
              lineHeight: "1",
              padding: "0 4px",
            },
            ".cm-searchMatch": {
              backgroundColor: dark ? "#623315" : "#fef08a",
              outline: dark ? "1px solid #b5651d" : "1px solid #fbbf24",
            },
            ".cm-searchMatch.cm-searchMatch-selected": {
              backgroundColor: dark ? "#b5651d" : "#f59e0b",
            },
          },
          { dark },
        ),

        EditorView.lineWrapping,
        placeholder("Enter SQL...  Cmd+Enter runs current selection or full query"),

        sql({
          dialect: dbType === "postgres" ? PostgreSQL : MySQL,
          schema: schemaMap,
          upperCaseKeywords: true,
        }),

        autocompletion({ activateOnTyping: true, maxRenderedOptions: 50 }),
        closeBrackets(),

        history(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        highlightSelectionMatches(),

        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),

        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
          ...searchKeymap,
          ...foldKeymap,
          ...closeBracketsKeymap,
          ...lintKeymap,
          { key: "Mod-Enter", run: () => { onExecute(); return true; } },
          { key: "Ctrl-Enter", run: () => { onExecute(); return true; } },
          { key: "Mod-Shift-Enter", run: () => { onExecuteAll(); return true; } },
          { key: "Ctrl-Shift-Enter", run: () => { onExecuteAll(); return true; } },
        ]),

        EditorState.readOnly.of(readOnly ?? false),
      ];
    }, [theme, onChange, onExecute, onExecuteAll, readOnly, dbType, autocompleteItems]);

    // Recreate editor when theme, dialect, or autocomplete data changes
    useEffect(() => {
      if (!editorRef.current) return;
      if (viewRef.current) viewRef.current.destroy();

      const view = new EditorView({
        state: EditorState.create({ doc: value, extensions: getExtensions() }),
        parent: editorRef.current,
      });
      viewRef.current = view;

      return () => {
        view.destroy();
        viewRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [theme, dbType, autocompleteItems]);

    // Sync external value changes without recreating the editor
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current !== value) {
        view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
      }
    }, [value]);

    // Keep resize observers happy
    useEffect(() => {
      const observer = new ResizeObserver(() => viewRef.current?.requestMeasure());
      if (editorRef.current) observer.observe(editorRef.current);
      return () => observer.disconnect();
    }, []);

    return <div ref={editorRef} className="h-full w-full overflow-hidden" />;
  },
);
