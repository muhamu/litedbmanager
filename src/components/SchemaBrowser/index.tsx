import { Network } from "lucide-react";
import { SchemaTree } from "./SchemaTree";
import { ContextMenu } from "./ContextMenu";
import { CreateDialog } from "./CreateDialog";

export function SchemaBrowser() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* DBeaver-style panel title */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-2 py-1 border-b border-gray-200 dark:border-gray-700 bg-[#ececec] dark:bg-[#2d2d2d]">
        <Network size={11} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Database Navigator
        </span>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <SchemaTree />
      </div>
      <ContextMenu />
      <CreateDialog />
    </div>
  );
}
