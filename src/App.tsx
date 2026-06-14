import { useState, useEffect } from "react";
import { QueryEditor } from "./components/QueryEditor";
import { ObjectViewer } from "./components/ObjectViewer";
import { ConnectionManager } from "./components/ConnectionManager";
import { SchemaBrowser } from "./components/SchemaBrowser";
import { ThemeToggle } from "./components/shared/ThemeToggle";
import { AboutDialog } from "./components/shared/AboutDialog";
import { useConnectionStore } from "./stores/connectionStore";
import { useSchemaStore } from "./stores/schemaStore";
import { useThemeStore } from "./stores/themeStore";
import { Database, Info, Menu, X } from "lucide-react";
import { useQueryStore } from "./stores/queryStore";

function App() {
  const { connectedId, serverVersion, profiles, disconnect } =
    useConnectionStore();
  const { clearSchema, selectedObject, closeObjectViewer } = useSchemaStore();
  const { theme } = useThemeStore();
  const { newTab } = useQueryStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showAbout, setShowAbout] = useState(false);

  const connectedProfile = profiles.find((p) => p.id === connectedId);

  // Apply theme class on mount & changes
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const handleDisconnect = () => {
    if (connectedId) {
      clearSchema();
      disconnect(connectedId);
    }
  };

  const handleNewQuery = () => {
    closeObjectViewer();
    newTab();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-[#1e1e1e] transition-colors">
      {/* ── Top bar ── */}
      <div className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between h-10 px-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] select-none drag-region">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Toggle sidebar"
          >
            {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
          <div className="flex items-center gap-2">
            <Database size={14} className="text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              LiteDB Manager
            </span>
          </div>
          {connectedProfile && (
            <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">
              {connectedProfile.host}:{connectedProfile.port}
              {serverVersion && (
                <span className="ml-2 text-green-600 dark:text-green-400">
                  ● {serverVersion.split("-")[0]}
                </span>
              )}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {connectedId && (
            <>
              <button
                onClick={handleNewQuery}
                className="rounded px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
              >
                New Query
              </button>
              <button
                onClick={handleDisconnect}
                className="rounded px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
              >
                Disconnect
              </button>
            </>
          )}
          <ThemeToggle />
          <button
            onClick={() => setShowAbout(true)}
            className="rounded p-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="About"
          >
            <Info size={14} />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 pt-10 overflow-hidden">
        {/* ── Sidebar ── */}
        <aside
          className={`flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 transition-all duration-200 overflow-hidden ${
            sidebarOpen ? "w-[280px]" : "w-0"
          }`}
        >
          {/* Connection manager */}
          <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
            <ConnectionManager />
          </div>

          {/* Schema browser */}
          {connectedId && (
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <SchemaBrowser />
            </div>
          )}
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-[#1e1e1e]">
          {connectedId && connectedProfile ? (
            selectedObject ? (
              <ObjectViewer />
            ) : (
              <QueryEditor />
            )
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Database
                  size={56}
                  className="mx-auto mb-4 text-gray-300 dark:text-gray-600"
                />
                <h1 className="text-xl font-semibold text-gray-400 dark:text-gray-500">
                  LiteDB Manager
                </h1>
                <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
                  Add a database connection to get started
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Dialogs ── */}
      <AboutDialog open={showAbout} onClose={() => setShowAbout(false)} />
    </div>
  );
}

export default App;
