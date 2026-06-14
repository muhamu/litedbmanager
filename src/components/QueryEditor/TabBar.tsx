import { X, Plus, Circle } from "lucide-react";
import type { QueryTab } from "../../stores/queryStore";

interface TabBarProps {
  tabs: QueryTab[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export function TabBar({ tabs, activeTabId, onSelect, onClose, onNew }: TabBarProps) {
  if (tabs.length === 0) {
    return (
      <div className="flex items-center border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-1 py-0.5">
        <button
          onClick={onNew}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="New tab (Cmd+T)"
        >
          <Plus size={12} />
          New Query
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-x-auto">
      <div className="flex flex-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 cursor-pointer select-none transition-colors min-w-0 max-w-[180px] ${
                isActive
                  ? "bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-gray-100 border-t-2 border-t-blue-500 mt-0"
                  : "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              {tab.running && (
                <Circle size={8} className="text-blue-500 animate-pulse fill-blue-500 flex-shrink-0" />
              )}
              <span className="truncate flex-1">{tab.name}</span>
              {tab.modified && (
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 flex-shrink-0" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
                className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 flex-shrink-0"
                title="Close (Cmd+W)"
              >
                <X size={10} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        onClick={onNew}
        className="flex-shrink-0 px-2 py-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors border-l border-gray-200 dark:border-gray-700"
        title="New tab"
      >
        <Plus size={12} />
      </button>
    </div>
  );
}
