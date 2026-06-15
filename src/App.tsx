import { useState, useEffect } from "react";
import { QueryEditor } from "./components/QueryEditor";
import { ConnectionManager } from "./components/ConnectionManager";
import { SchemaBrowser } from "./components/SchemaBrowser";
import { ThemeToggle } from "./components/shared/ThemeToggle";
import { AboutDialog } from "./components/shared/AboutDialog";
import { useConnectionStore } from "./stores/connectionStore";
import { useSchemaStore } from "./stores/schemaStore";
import { useThemeStore } from "./stores/themeStore";
import {
  Database, Info, Menu, X, Play, Plus, Unplug,
  RefreshCw, FolderOpen, Server, ChevronRight, Table2, LayoutGrid
} from "lucide-react";
import { useQueryStore } from "./stores/queryStore";

// ── DB type color indicator ──
function DbTypeBadge({ dbType }: { dbType: string }) {
  const styles: Record<string, string> = {
    mysql:      "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    postgres:   "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    clickhouse: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  };
  const labels: Record<string, string> = {
    mysql: "MySQL", postgres: "PG", clickhouse: "CH"
  };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${styles[dbType] ?? "bg-gray-100 text-gray-600"}`}>
      {labels[dbType] ?? dbType}
    </span>
  );
}

// ── DBeaver-style breadcrumb: host › Databases › db › Tables › table ──
function Breadcrumb() {
  const { selectedObject, selectedDb } = useSchemaStore();
  const { connectedId, profiles } = useConnectionStore();
  const connectedProfile = profiles.find((p) => p.id === connectedId);
  if (!connectedProfile) return null;

  const db = selectedObject?.database ?? selectedDb ?? null;
  const groupLabel =
    selectedObject?.type === "view" ? "Views"
    : selectedObject?.type === "procedure" || selectedObject?.type === "function" ? "Routines"
    : selectedObject?.type === "trigger" ? "Triggers"
    : selectedObject?.type === "sequence" ? "Sequences"
    : selectedObject?.type === "table" ? "Tables"
    : null;

  const sep = <ChevronRight size={12} className="text-gray-400 dark:text-gray-600 flex-shrink-0" />;
  const crumb = (icon: React.ReactNode, label: string) => (
    <span className="flex items-center gap-1 px-1 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
      {icon}{label}
    </span>
  );

  return (
    <div className="hidden md:flex items-center gap-0.5 min-w-0 overflow-hidden">
      {crumb(<Server size={12} className="text-green-600 dark:text-green-500" />, connectedProfile.host)}
      {sep}
      {crumb(<Database size={12} className="text-amber-500" />, "Databases")}
      {db && <>{sep}{crumb(<Database size={12} className="text-blue-500" />, db)}</>}
      {selectedObject && groupLabel && <>{sep}{crumb(<Table2 size={12} className="text-blue-400" />, groupLabel)}</>}
      {selectedObject && <>{sep}{crumb(
        selectedObject.type === "view"
          ? <LayoutGrid size={12} className="text-purple-500" />
          : <Table2 size={12} className="text-blue-500" />,
        selectedObject.name,
      )}</>}
    </div>
  );
}

function App() {
  const { connectedId, serverVersion, profiles, disconnect } = useConnectionStore();
  const { clearSchema, closeObjectViewer } = useSchemaStore();
  const { theme } = useThemeStore();
  const { newTab } = useQueryStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showAbout, setShowAbout] = useState(false);

  const connectedProfile = profiles.find((p) => p.id === connectedId);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const handleDisconnect = () => {
    if (connectedId) { clearSchema(); disconnect(connectedId); }
  };

  const handleNewQuery = () => {
    closeObjectViewer();
    newTab();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-[#1e1e1e] transition-colors">

      {/* ── Row 1: Title / Menu bar ── */}
      <div className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between h-9 px-2 border-b border-gray-200 dark:border-gray-700 bg-[#f3f3f3] dark:bg-[#252526] select-none drag-region">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Toggle sidebar"
          >
            {sidebarOpen ? <X size={14} /> : <Menu size={14} />}
          </button>
          <div className="flex items-center gap-1.5">
            <Database size={13} className="text-blue-500" />
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">LiteDB Manager</span>
          </div>
          {/* Breadcrumb navigation (replaces the non-functional menu) */}
          <Breadcrumb />
        </div>

        <div className="flex items-center gap-1">
          {connectedProfile && (
            <div className="hidden sm:flex items-center gap-1.5 mr-2">
              <DbTypeBadge dbType={connectedProfile.db_type} />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {connectedProfile.host}:{connectedProfile.port}
              </span>
              {serverVersion && (
                <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">
                  ● {serverVersion.split(" ").slice(0, 2).join(" ").split("-")[0]}
                </span>
              )}
            </div>
          )}
          <ThemeToggle />
          <button
            onClick={() => setShowAbout(true)}
            className="rounded p-1 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="About"
          >
            <Info size={13} />
          </button>
        </div>
      </div>

      {/* ── Row 2: Toolbar (DBeaver-style icon strip) ── */}
      <div className="fixed top-9 left-0 right-0 z-20 flex items-center h-8 px-1 border-b border-gray-200 dark:border-gray-700 bg-[#ececec] dark:bg-[#2d2d2d] select-none">
        {/* Left group */}
        <div className="flex items-center gap-px">
          <ToolBtn icon={<FolderOpen size={14} />} title="Open Connection Manager" />
          <ToolBtn icon={<Plus size={14} />} title="New Connection" />
        </div>
        <ToolSep />
        {connectedId ? (
          <>
            <div className="flex items-center gap-px">
              <ToolBtn icon={<Play size={14} className="text-green-600 dark:text-green-400" />} title="New Query (Ctrl+T)" onClick={handleNewQuery} />
              <ToolBtn icon={<RefreshCw size={14} />} title="Refresh Schema" />
            </div>
            <ToolSep />
            <ToolBtn icon={<Unplug size={14} className="text-red-500" />} title="Disconnect" onClick={handleDisconnect} />
          </>
        ) : null}

        {/* Right side: connection badge */}
        {connectedProfile && (
          <div className="ml-auto flex items-center gap-2 pr-2">
            <span className="text-[10px] text-gray-500 dark:text-gray-400">
              Connected: <span className="font-medium text-gray-700 dark:text-gray-300">{connectedProfile.name}</span>
            </span>
          </div>
        )}
      </div>

      {/* ── Body (shifted down 17 = 9+8 px) ── */}
      <div className="flex flex-1 pt-[68px] overflow-hidden">
        {/* ── Sidebar ── */}
        <aside className={`flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#252526] transition-all duration-200 overflow-hidden ${sidebarOpen ? "w-[270px]" : "w-0"}`}>
          <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
            <ConnectionManager />
          </div>
          {connectedId && (
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <SchemaBrowser />
            </div>
          )}
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-[#1e1e1e]">
          {connectedId && connectedProfile ? (
            <QueryEditor />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Database size={52} className="mx-auto mb-4 text-gray-200 dark:text-gray-700" />
                <h1 className="text-lg font-semibold text-gray-400 dark:text-gray-500">LiteDB Manager</h1>
                <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">Add a database connection to get started</p>
              </div>
            </div>
          )}
        </main>
      </div>

      <AboutDialog open={showAbout} onClose={() => setShowAbout(false)} />
    </div>
  );
}

function ToolBtn({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center w-7 h-7 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-300/60 dark:hover:bg-gray-600/60 transition-colors"
    >
      {icon}
    </button>
  );
}

function ToolSep() {
  return <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />;
}

export default App;
