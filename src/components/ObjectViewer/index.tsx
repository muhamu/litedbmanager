import { X, Table2, LayoutGrid, Workflow, FunctionSquare, Zap, Hash, RefreshCw, ChevronDown } from "lucide-react";
import { useSchemaStore } from "../../stores/schemaStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { ResultGrid } from "../ResultGrid";
import type { ColumnInfo } from "../../lib/tauri";

function ObjectIcon({ type }: { type: string }) {
  switch (type) {
    case "table":     return <Table2 size={14} className="text-blue-500" />;
    case "view":      return <LayoutGrid size={14} className="text-purple-500" />;
    case "procedure": return <Workflow size={14} className="text-orange-500" />;
    case "function":  return <FunctionSquare size={14} className="text-orange-500" />;
    case "trigger":   return <Zap size={14} className="text-yellow-500" />;
    case "sequence":  return <Hash size={14} className="text-green-500" />;
    default:          return null;
  }
}

function ColumnsBadge({ col }: { col: ColumnInfo }) {
  if (col.key === "PRI") return <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">PK</span>;
  if (col.key === "UNI") return <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">UQ</span>;
  if (col.key === "MUL") return <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">FK</span>;
  return null;
}

function ColumnsTab({ columns }: { columns: ColumnInfo[] | undefined }) {
  if (!columns || columns.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400 dark:text-gray-500">
        No column data available
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="sticky top-0 z-10">
            <th className="bg-gray-100 dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-700 px-2 py-1.5 text-left font-semibold text-gray-600 dark:text-gray-400 w-8 text-center select-none">#</th>
            <th className="bg-gray-100 dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-700 px-3 py-1.5 text-left font-semibold text-gray-600 dark:text-gray-400 select-none">Column Name</th>
            <th className="bg-gray-100 dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-700 px-3 py-1.5 text-left font-semibold text-gray-600 dark:text-gray-400 select-none">Data Type</th>
            <th className="bg-gray-100 dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-700 px-3 py-1.5 text-center font-semibold text-gray-600 dark:text-gray-400 w-20 select-none">Not Null</th>
            <th className="bg-gray-100 dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-700 px-3 py-1.5 text-center font-semibold text-gray-600 dark:text-gray-400 w-14 select-none">Key</th>
            <th className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 py-1.5 text-left font-semibold text-gray-600 dark:text-gray-400 select-none">Default</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col, idx) => (
            <tr
              key={col.name}
              className="border-b border-gray-100 dark:border-gray-800 hover:bg-blue-50/60 dark:hover:bg-blue-900/20 transition-colors"
            >
              <td className="border-r border-gray-100 dark:border-gray-800 px-2 py-1 text-gray-400 dark:text-gray-600 text-center tabular-nums">{idx + 1}</td>
              <td className="border-r border-gray-100 dark:border-gray-800 px-3 py-1 font-mono text-gray-800 dark:text-gray-200 font-medium">{col.name}</td>
              <td className="border-r border-gray-100 dark:border-gray-800 px-3 py-1 font-mono text-blue-600 dark:text-blue-400">{col.col_type}</td>
              <td className="border-r border-gray-100 dark:border-gray-800 px-3 py-1 text-center">
                {!col.nullable
                  ? <span className="text-green-600 dark:text-green-400 font-bold">✓</span>
                  : <span className="text-gray-300 dark:text-gray-600">—</span>}
              </td>
              <td className="border-r border-gray-100 dark:border-gray-800 px-3 py-1 text-center">
                <ColumnsBadge col={col} />
              </td>
              <td className="px-3 py-1 font-mono text-gray-500 dark:text-gray-400 text-[11px]">
                {col.default ?? <span className="text-gray-300 dark:text-gray-600 italic">NULL</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Status bar */}
      <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1 text-xs text-gray-500 dark:text-gray-400">
        {columns.length} column{columns.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

export function ObjectViewer() {
  const {
    selectedObject,
    objectData,
    objectCreateStmt,
    objectRowCount,
    objectLoading,
    objectLoadingMore,
    objectHasMore,
    objectViewTab,
    tableColumns,
    setObjectViewTab,
    closeObjectViewer,
    selectObject,
    loadMoreObjectData,
  } = useSchemaStore();
  const { connectedId } = useConnectionStore();

  if (!selectedObject) return null;

  const obj = selectedObject;
  const isTabular = obj.type === "table" || obj.type === "view";
  const tblKey = `${obj.database}.${obj.name}`;
  const columns = tableColumns[tblKey];

  const handleRefresh = () => {
    if (connectedId) selectObject(connectedId, obj);
  };

  const handleLoadMore = () => {
    if (connectedId) loadMoreObjectData(connectedId);
  };

  const tabs = [
    ...(isTabular ? [{ id: "columns" as const, label: "Columns" }] : []),
    ...(isTabular ? [{ id: "data" as const, label: "Data" }] : []),
    { id: "ddl" as const, label: "DDL" },
  ];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#1e1e1e]">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#252526] px-3 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <ObjectIcon type={obj.type} />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
            <span className="text-gray-400 dark:text-gray-500 font-normal">{obj.database}.</span>
            {obj.name}
          </span>
          <span className="flex-shrink-0 text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700 rounded px-1.5 py-0.5">
            {obj.type}
          </span>
          {objectRowCount !== null && (
            <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">
              ~{objectRowCount.toLocaleString()} rows
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleRefresh}
            className="rounded p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={closeObjectViewer}
            className="rounded p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex-shrink-0 flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#252526]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setObjectViewTab(tab.id)}
            className={`px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${
              objectViewTab === tab.id
                ? "border-blue-500 text-blue-700 dark:text-blue-400 bg-white dark:bg-[#1e1e1e]"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {objectLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Loading...
            </div>
          </div>
        ) : objectViewTab === "columns" && isTabular ? (
          <ColumnsTab columns={columns} />
        ) : objectViewTab === "data" && isTabular ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <ResultGrid result={objectData} error={null} running={false} />
            </div>
            {/* Load More */}
            {objectHasMore && (
              <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 flex items-center gap-3">
                <button
                  onClick={handleLoadMore}
                  disabled={objectLoadingMore}
                  className="flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
                >
                  {objectLoadingMore
                    ? <><div className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin" />Loading...</>
                    : <><ChevronDown size={12} />Load 200 more rows</>
                  }
                </button>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  Showing {objectData?.rows.length ?? 0} rows
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4">
            <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 whitespace-pre-wrap break-all">
              {objectCreateStmt}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
