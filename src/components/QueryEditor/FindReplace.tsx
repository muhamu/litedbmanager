import { useState } from "react";
import { Search, X, ArrowUp, ArrowDown, Replace } from "lucide-react";

interface FindReplaceProps {
  onClose: () => void;
  onFind: (query: string, direction: "prev" | "next") => void;
  onReplace: (from: string, to: string) => void;
  onReplaceAll: (from: string, to: string) => void;
}

export function FindReplace({ onClose, onFind, onReplace, onReplaceAll }: FindReplaceProps) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");

  return (
    <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-xs">
      <Search size={12} className="text-gray-400 flex-shrink-0" />
      <input
        className="flex-1 min-w-[120px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-xs text-gray-800 dark:text-gray-200 placeholder:text-gray-400 outline-none focus:border-blue-500"
        placeholder="Find..."
        value={find}
        onChange={(e) => setFind(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onFind(find, e.shiftKey ? "prev" : "next");
        }}
        autoFocus
      />
      <button
        onClick={() => onFind(find, "prev")}
        className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
        title="Previous (Shift+Enter)"
      >
        <ArrowUp size={12} />
      </button>
      <button
        onClick={() => onFind(find, "next")}
        className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
        title="Next (Enter)"
      >
        <ArrowDown size={12} />
      </button>
      <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
      <Replace size={12} className="text-gray-400 flex-shrink-0" />
      <input
        className="w-[100px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-xs text-gray-800 dark:text-gray-200 placeholder:text-gray-400 outline-none focus:border-blue-500"
        placeholder="Replace..."
        value={replace}
        onChange={(e) => setReplace(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onReplace(find, replace);
        }}
      />
      <button
        onClick={() => onReplace(find, replace)}
        className="rounded px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
      >
        Replace
      </button>
      <button
        onClick={() => onReplaceAll(find, replace)}
        className="rounded px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
      >
        All
      </button>
      <button
        onClick={onClose}
        className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
      >
        <X size={12} />
      </button>
    </div>
  );
}
