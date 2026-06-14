import { SchemaTree } from "./SchemaTree";
import { ContextMenu } from "./ContextMenu";
import { CreateDialog } from "./CreateDialog";

export function SchemaBrowser() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <SchemaTree />
      </div>
      <ContextMenu />
      <CreateDialog />
    </div>
  );
}
