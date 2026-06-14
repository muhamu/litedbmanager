import { Database, Plug, PlugZap, Trash2 } from "lucide-react";
import type { ConnectionProfile } from "../../lib/tauri";

interface ConnectionListProps {
  profiles: ConnectionProfile[];
  connectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDisconnect: (id: string) => void;
}

export function ConnectionList({
  profiles,
  connectedId,
  onSelect,
  onDelete,
  onDisconnect,
}: ConnectionListProps) {
  return (
    <div className="flex flex-col gap-1">
      {profiles.length === 0 && (
        <p className="px-3 py-4 text-xs text-gray-400 text-center">
          No connections yet.
          <br />
          Add one above.
        </p>
      )}
      {profiles.map((p) => {
        const isConnected = connectedId === p.id;
        return (
          <div
            key={p.id}
            className={`group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
              isConnected
                ? "bg-blue-50 text-blue-700"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Database size={14} className={isConnected ? "text-blue-600" : "text-gray-400"} />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{p.name}</div>
              <div className="text-xs text-gray-400 truncate">
                {p.user}@{p.host}:{p.port}
              </div>
            </div>
            <div className="hidden group-hover:flex items-center gap-1">
              {isConnected ? (
                <button
                  onClick={() => onDisconnect(p.id)}
                  className="rounded p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-50"
                  title="Disconnect"
                >
                  <PlugZap size={14} />
                </button>
              ) : (
                <button
                  onClick={() => onSelect(p.id)}
                  className="rounded p-1 text-gray-400 hover:text-green-600 hover:bg-green-50"
                  title="Connect"
                >
                  <Plug size={14} />
                </button>
              )}
              <button
                onClick={() => onDelete(p.id)}
                className="rounded p-1 text-gray-400 hover:text-red-600 hover:bg-red-50"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
