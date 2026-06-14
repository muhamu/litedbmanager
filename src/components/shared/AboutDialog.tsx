import { Dialog } from "./Dialog";
import { Database } from "lucide-react";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AboutDialog({ open, onClose }: AboutDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="About LiteDB Manager">
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900">
          <Database size={32} className="text-blue-600 dark:text-blue-300" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          LiteDB Manager
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Version 0.1.0
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300 text-center max-w-xs">
          Lightweight MySQL/MariaDB GUI client for macOS.
          <br />
          Built with Tauri, React, and Rust.
        </p>
        <div className="mt-2 w-full rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
          <p>Author: Data Engineer</p>
          <p>Stack: Tauri 2.x + React + Tailwind CSS + Rust</p>
          <p>License: MIT</p>
        </div>
      </div>
    </Dialog>
  );
}
