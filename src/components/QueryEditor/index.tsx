import { useEffect, useCallback, useState, useRef } from "react";
import { Play, Save, FileText, Search as SearchIcon, Download } from "lucide-react";
import { useQueryStore } from "../../stores/queryStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { useSchemaStore } from "../../stores/schemaStore";
import { TabBar } from "./TabBar";
import { EditorPane, type EditorPaneHandle } from "./EditorPane";
import { ResultGrid } from "../ResultGrid";
import { TableViewer } from "../TableViewer";
import * as api from "../../lib/tauri";
import type { AutocompleteItem } from "../../lib/tauri";

export function QueryEditor() {
  const {
    tabs,
    activeTabId,
    newTab,
    closeTab,
    setActiveTab,
    updateSql,
    executeQuery,
    executeAll,
    saveCurrentQuery,
  } = useQueryStore();
  const { connectedId, profiles } = useConnectionStore();
  const { selectedDb } = useSchemaStore();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [autocompleteItems, setAutocompleteItems] = useState<AutocompleteItem[]>([]);
  const [dbType, setDbType] = useState<string>("mysql");
  const editorRef = useRef<EditorPaneHandle>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeSqlTab = activeTab?.kind === "sql" ? activeTab : null;
  const connectedProfile = profiles.find((p) => p.id === connectedId);

  useEffect(() => {
    if (connectedProfile) setDbType(connectedProfile.db_type || "mysql");
  }, [connectedProfile]);

  // Reload autocomplete whenever the active database changes
  useEffect(() => {
    if (!connectedId || !selectedDb) return;
    api.getAutocompleteData(connectedId, selectedDb)
      .then((data) => setAutocompleteItems(data.items))
      .catch(() => setAutocompleteItems([]));
  }, [connectedId, selectedDb, activeTabId]);

  // Global keyboard shortcuts (Ctrl+T new tab, Ctrl+W close, Ctrl+F find, Ctrl+S save)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === "t") {
        e.preventDefault();
        newTab();
      } else if (e.key === "w") {
        e.preventDefault();
        if (activeTabId) closeTab(activeTabId);
      } else if (e.key === "f") {
        // Let CM handle it when it has focus; intercept only when it doesn't
        e.preventDefault();
        editorRef.current?.openSearch();
      } else if (e.key === "s") {
        e.preventDefault();
        if (activeTab?.kind === "sql" && activeTab.sql.trim()) {
          setSaveName(activeTab.name);
          setShowSaveDialog(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTabId, activeTab, newTab, closeTab]);

  // Execute selected text if any, otherwise full tab SQL — DBeaver-style Ctrl+Enter
  const handleExecute = useCallback(() => {
    if (!connectedId) return;
    const selection = editorRef.current?.getSelectedText() ?? "";
    executeQuery(connectedId, selection || undefined);
  }, [connectedId, executeQuery]);

  const handleExecuteAll = useCallback(() => {
    if (!connectedId) return;
    executeAll(connectedId);
  }, [connectedId, executeAll]);

  const handleExportCsv = () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab || tab.kind !== "sql" || !tab.result) return;
    const { columns, rows } = tab.result;
    api.exportCsv(columns, rows, ",", true).then((res) => {
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    }).catch(console.error);
  };

  const handleExportJson = () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab || tab.kind !== "sql" || !tab.result) return;
    const { columns, rows } = tab.result;
    api.exportJson(columns, rows, true).then((res) => {
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    }).catch(console.error);
  };

  const handleSave = () => {
    if (saveName.trim()) {
      saveCurrentQuery(saveName.trim());
      setShowSaveDialog(false);
    }
  };

  if (!connectedId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
        <div className="text-center">
          <FileText size={40} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Connect to a database to start querying</p>
        </div>
      </div>
    );
  }

  // Table-viewer tabs bypass the SQL editor entirely
  if (activeTab?.kind === "table") {
    return (
      <div className="flex flex-col h-full bg-white dark:bg-[#1e1e1e]">
        <TabBar tabs={tabs} activeTabId={activeTabId} onSelect={setActiveTab} onClose={closeTab} onNew={() => newTab()} />
        <div className="flex-1 overflow-hidden">
          <TableViewer tab={activeTab} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#1e1e1e]">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1">
        <button
          onClick={() => newTab()}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="New tab (Ctrl+T)"
        >
          <FileText size={12} />
          New
        </button>
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
        <button
          onClick={handleExecute}
          disabled={!activeSqlTab?.sql.trim() || activeSqlTab?.running}
          className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Run selection or full query (Ctrl+Enter)"
        >
          <Play size={12} fill="currentColor" />
          Run
        </button>
        <button
          onClick={() => editorRef.current?.openSearch()}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="Find / Replace (Ctrl+F)"
        >
          <SearchIcon size={12} />
          Find
        </button>
        <button
          onClick={() => {
            if (activeSqlTab?.sql.trim()) {
              setSaveName(activeSqlTab.name);
              setShowSaveDialog(true);
            }
          }}
          disabled={!activeSqlTab?.sql.trim()}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          title="Save query (Ctrl+S)"
        >
          <Save size={12} />
          Save
        </button>
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
        {activeSqlTab?.result && activeSqlTab.result.rows.length > 0 && (
          <>
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="Export as CSV"
            >
              <Download size={12} />
              CSV
            </button>
            <button
              onClick={handleExportJson}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="Export as JSON"
            >
              <Download size={12} />
              JSON
            </button>
          </>
        )}
      </div>

      {/* Tab bar */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={setActiveTab}
        onClose={closeTab}
        onNew={() => newTab()}
      />

      {/* Editor + Results split */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 min-h-[120px] overflow-hidden border-b border-gray-200 dark:border-gray-700">
          {activeSqlTab ? (
            <EditorPane
              ref={editorRef}
              key={`editor-${activeSqlTab.id}`}
              value={activeSqlTab.sql}
              onChange={(s) => updateSql(activeSqlTab.id, s)}
              onExecute={handleExecute}
              onExecuteAll={handleExecuteAll}
              dbType={dbType}
              autocompleteItems={autocompleteItems}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
              <div className="text-center">
                <FileText size={32} className="mx-auto mb-1 opacity-50" />
                <p className="text-xs">Open a new query tab (Ctrl+T)</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-[100px] overflow-hidden">
          <ResultGrid
            result={activeSqlTab?.result ?? null}
            error={activeSqlTab?.error ?? null}
            running={activeSqlTab?.running ?? false}
          />
        </div>
      </div>

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="min-w-[320px] rounded-lg bg-white dark:bg-gray-800 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Save Query</h2>
              <button
                onClick={() => setShowSaveDialog(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                ×
              </button>
            </div>
            <div className="px-4 py-4">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Query Name</label>
              <input
                className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-200 outline-none focus:border-blue-500"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                autoFocus
                placeholder="My Query"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!saveName.trim()}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
