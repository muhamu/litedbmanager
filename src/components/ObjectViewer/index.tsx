import { X, Table2, LayoutGrid, Workflow, FunctionSquare, Zap, Hash } from "lucide-react";
import { useSchemaStore } from "../../stores/schemaStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { ResultGrid } from "../ResultGrid";

export function ObjectViewer() {
  const {
    selectedObject,
    objectData,
    objectCreateStmt,
    objectRowCount,
    objectLoading,
    objectViewTab,
    setObjectViewTab,
    closeObjectViewer,
    selectObject,
  } = useSchemaStore();
  const { connectedId } = useConnectionStore();

  if (!selectedObject) return null;

  const obj = selectedObject;

  const icon = () => {
    switch (obj.type) {
      case "table":
        return <Table2 size={16} className="text-blue-500" />;
      case "view":
        return <LayoutGrid size={16} className="text-purple-500" />;
      case "procedure":
        return <Workflow size={16} className="text-orange-500" />;
      case "function":
        return <FunctionSquare size={16} className="text-orange-500" />;
      case "trigger":
        return <Zap size={16} className="text-yellow-500" />;
      case "sequence":
        return <Hash size={16} className="text-green-500" />;
    }
  };

  const showDataTab = obj.type === "table" || obj.type === "view";

  const handleRefresh = () => {
    if (connectedId) {
      selectObject(connectedId, obj);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#1e1e1e]">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1.5">
        <div className="flex items-center gap-2">
          {icon()}
          <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
            <span className="text-gray-400 dark:text-gray-500 font-normal">
              {obj.database}.
            </span>
            {obj.name}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700 rounded px-1.5 py-0.5">
            {obj.type}
          </span>
          {objectRowCount !== null && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              ~{objectRowCount.toLocaleString()} rows
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="rounded px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Refresh
          </button>
          <button
            onClick={closeObjectViewer}
            className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tab bar (Data / DDL) */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        {showDataTab && (
          <button
            onClick={() => setObjectViewTab("data")}
            className={`px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${
              objectViewTab === "data"
                ? "border-blue-500 text-blue-700 dark:text-blue-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Data
          </button>
        )}
        <button
          onClick={() => setObjectViewTab("ddl")}
          className={`px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${
            objectViewTab === "ddl"
              ? "border-blue-500 text-blue-700 dark:text-blue-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          DDL
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {objectLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              Loading...
            </div>
          </div>
        ) : objectViewTab === "data" && showDataTab ? (
          <ResultGrid result={objectData} error={null} running={false} />
        ) : (
          /* DDL tab */
          <div className="h-full overflow-auto p-4">
            <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 whitespace-pre-wrap break-all">
              {objectCreateStmt}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
