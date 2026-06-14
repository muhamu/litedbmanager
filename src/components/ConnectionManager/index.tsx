import { useEffect, useState } from "react";
import { Plus, Server, Loader2 } from "lucide-react";
import { useConnectionStore } from "../../stores/connectionStore";
import { useSchemaStore } from "../../stores/schemaStore";
import { ConnectionList } from "./ConnectionList";
import { ConnectionForm } from "./ConnectionForm";
import { Dialog } from "../shared/Dialog";
import type { ProfileInput } from "../../lib/tauri";

export function ConnectionManager() {
  const {
    profiles,
    connectedId,
    serverVersion,
    loading,
    error,
    loadProfiles,
    addProfile,
    removeProfile,
    connect,
    disconnect,
  } = useConnectionStore();

  const { loadDatabases, databases } = useSchemaStore();
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleConnect = async (id: string) => {
    await connect(id);
    if (useConnectionStore.getState().connectedId) {
      await loadDatabases(id);
    }
  };

  const handleSave = async (input: ProfileInput) => {
    await addProfile(input);
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this connection profile?")) {
      await removeProfile(id);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Server size={16} className="text-blue-600" />
          <span className="text-sm font-semibold text-gray-900">Connections</span>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
          title="Add connection"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Connected indicator */}
      {connectedId && (
        <div className="mx-2 mt-2 rounded-md bg-green-50 px-2 py-1 text-xs text-green-700 truncate">
          <div className="font-medium">
            Connected: {profiles.find((p) => p.id === connectedId)?.name}
          </div>
          {serverVersion && <div className="text-green-500">{serverVersion}</div>}
        </div>
      )}

      {connectedId && databases.length > 0 && (
        <div className="mx-2 mt-1 rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700">
          {databases.length} databases
        </div>
      )}

      {error && (
        <div className="mx-2 mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={16} className="animate-spin text-gray-400" />
        </div>
      )}

      {/* Profile list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <ConnectionList
          profiles={profiles}
          connectedId={connectedId}
          onSelect={handleConnect}
          onDelete={handleDelete}
          onDisconnect={(id) => disconnect(id)}
        />
      </div>

      {/* Add connection dialog */}
      <Dialog open={showForm} onClose={() => setShowForm(false)} title="New Connection">
        <ConnectionForm onSave={handleSave} />
      </Dialog>
    </div>
  );
}
