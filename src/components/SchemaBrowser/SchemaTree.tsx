import { useState, useCallback } from "react";
import {
  Database,
  Table2,
  LayoutGrid,
  Code2,
  Hash,
  Link2,
  Filter,
  Loader2,
  ChevronRight,
  ChevronDown,
  Workflow,
  Zap,
  FunctionSquare,
  Columns3,
  Circle,
} from "lucide-react";
import { useConnectionStore } from "../../stores/connectionStore";
import { useSchemaStore } from "../../stores/schemaStore";
import type { SelectedObject } from "../../stores/schemaStore";
import type { ColumnInfo, IndexInfo, ForeignKeyInfo } from "../../lib/tauri";

// ── Icon mapping ──

function typeIcon(type: string) {
  switch (type) {
    case "table":
      return <Table2 size={13} className="text-blue-500" />;
    case "view":
      return <LayoutGrid size={13} className="text-purple-500" />;
    case "procedure":
      return <Workflow size={13} className="text-orange-500" />;
    case "function":
      return <FunctionSquare size={13} className="text-orange-500" />;
    case "trigger":
      return <Zap size={13} className="text-yellow-500" />;
    case "sequence":
      return <Hash size={13} className="text-emerald-500" />;
    default:
      return <Code2 size={13} className="text-gray-400" />;
  }
}

// ── Helpers ──

function isSelected(
  obj: SelectedObject | null,
  database: string,
  name: string,
  type: string,
) {
  return (
    obj?.database === database &&
    obj?.name === name &&
    obj?.type === type
  );
}

// ── Styled tree node ──

interface TreeNodeProps {
  label: React.ReactNode;
  icon: React.ReactNode;
  depth: number;
  expanded?: boolean;
  loading?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  onSelect?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
}

function TreeNode({
  label,
  icon,
  depth,
  expanded,
  loading,
  selected,
  onToggle,
  onSelect,
  onContextMenu,
  children,
}: TreeNodeProps) {
  const hasChildren = children !== undefined;
  const indent = depth * 14 + 6;

  return (
    <>
      <div
        className={`flex items-center gap-1 py-[3px] pr-2 text-xs cursor-default select-none transition-colors ${
          selected
            ? "bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200"
            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        }`}
        style={{ paddingLeft: indent }}
        onContextMenu={onContextMenu}
      >
        <span
          className="flex-shrink-0 w-4 h-4 flex items-center justify-center"
          onClick={onToggle}
        >
          {loading ? (
            <Loader2 size={10} className="animate-spin text-gray-400" />
          ) : hasChildren ? (
            expanded ? (
              <ChevronDown size={11} className="text-gray-400 dark:text-gray-500" />
            ) : (
              <ChevronRight size={11} className="text-gray-400 dark:text-gray-500" />
            )
          ) : null}
        </span>
        <span
          className="flex-shrink-0 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            if (onSelect) onSelect();
            else if (onToggle) onToggle();
          }}
        >
          {icon}
        </span>
        <span
          className="truncate flex-1 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            if (onSelect) onSelect();
            else if (onToggle) onToggle();
          }}
        >
          {label}
        </span>
      </div>
      {expanded && (
        <div className="transition-all">{children}</div>
      )}
    </>
  );
}

// ── Column leaf ──

function ColumnLeaf({ col, depth }: { col: ColumnInfo; depth: number }) {
  const isPk = col.key === "PRI";
  const badge = isPk ? "PK" : col.key === "UNI" ? "UQ" : col.key === "MUL" ? "FK" : "";
  const badgeColor = isPk
    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
    : "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300";

  return (
    <div
      className="flex items-center gap-1.5 py-[2px] pr-2 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50"
      style={{ paddingLeft: depth * 14 + 6 }}
    >
      <Columns3 size={10} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
      <span className="font-mono text-gray-700 dark:text-gray-200 truncate">{col.name}</span>
      <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate hidden xl:inline">{col.col_type}</span>
      {col.nullable && (
        <span className="text-[10px] text-gray-300 dark:text-gray-600 italic">null</span>
      )}
      {badge && (
        <span className={`ml-auto text-[9px] font-semibold px-1 rounded ${badgeColor}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

// ── Index leaf ──

function IndexLeaf({ idx, depth }: { idx: IndexInfo; depth: number }) {
  return (
    <div
      className="flex items-center gap-1.5 py-[2px] pr-2 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50"
      style={{ paddingLeft: depth * 14 + 6 }}
    >
      <Hash size={10} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
      <span className="font-mono text-gray-600 dark:text-gray-300 truncate">{idx.name}</span>
      <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
        ({idx.columns.join(", ")})
      </span>
      {idx.unique && (
        <span className="ml-auto text-[9px] font-semibold px-1 rounded bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">
          UQ
        </span>
      )}
    </div>
  );
}

// ── FK leaf ──

function FKLeaf({ fk, depth }: { fk: ForeignKeyInfo; depth: number }) {
  return (
    <div
      className="flex items-center gap-1.5 py-[2px] pr-2 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50"
      style={{ paddingLeft: depth * 14 + 6 }}
    >
      <Link2 size={10} className="text-violet-400 dark:text-violet-500 flex-shrink-0" />
      <span className="font-mono text-gray-600 dark:text-gray-300">{fk.column}</span>
      <span className="text-gray-300 dark:text-gray-600">→</span>
      <span className="font-mono text-violet-600 dark:text-violet-400 truncate">
        {fk.ref_table}.{fk.ref_column}
      </span>
    </div>
  );
}

// ── Table node ──

function TableNode({
  name,
  depth,
  expanded,
  loading,
  selected,
  columns,
  indexes,
  foreignKeys,
  onToggle,
  onSelect,
  onContextMenu,
}: {
  name: string;
  depth: number;
  expanded: boolean;
  loading: boolean;
  selected: boolean;
  columns: ColumnInfo[] | undefined;
  indexes: IndexInfo[] | undefined;
  foreignKeys: ForeignKeyInfo[] | undefined;
  onToggle: () => void;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div>
      {/* Table header line */}
      <div
        className={`flex items-center gap-1 py-[3px] pr-2 text-xs cursor-default select-none transition-colors ${
          selected
            ? "bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200"
            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        }`}
        style={{ paddingLeft: depth * 14 + 6 }}
      >
        <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center" onClick={onToggle}>
          {loading ? (
            <Loader2 size={10} className="animate-spin text-gray-400" />
          ) : expanded ? (
            <ChevronDown size={11} className="text-gray-400 dark:text-gray-500" />
          ) : (
            <ChevronRight size={11} className="text-gray-400 dark:text-gray-500" />
          )}
        </span>
        <span
          className="flex-shrink-0 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          <Table2 size={13} className="text-blue-500" />
        </span>
        <span
          className="truncate flex-1 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        >
          {name}
        </span>
        <span
          className="cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          onContextMenu={onContextMenu}
        >
          {columns && (
            <span className="text-[9px] text-gray-400 dark:text-gray-500 mr-1">{columns.length} cols</span>
          )}
        </span>
      </div>

      {expanded && (
        <div>
          {/* Columns */}
          {columns && columns.length > 0 && (
            <>
              <div
                className="flex items-center gap-1 py-[2px] pr-2 text-[9px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600"
                style={{ paddingLeft: (depth + 1) * 14 + 6 }}
              >
                <Circle size={4} className="fill-gray-400 dark:fill-gray-600" />
                Columns ({columns.length})
              </div>
              {columns.map((col) => <ColumnLeaf key={col.name} col={col} depth={depth + 1} />)}
            </>
          )}

          {/* Indexes */}
          {indexes && indexes.length > 0 && (
            <>
              <div
                className="flex items-center gap-1 py-[2px] pr-2 text-[9px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600"
                style={{ paddingLeft: (depth + 1) * 14 + 6 }}
              >
                <Circle size={4} className="fill-gray-400 dark:fill-gray-600" />
                Indexes ({indexes.length})
              </div>
              {indexes.map((idx) => <IndexLeaf key={idx.name} idx={idx} depth={depth + 1} />)}
            </>
          )}

          {/* Foreign Keys */}
          {foreignKeys && foreignKeys.length > 0 && (
            <>
              <div
                className="flex items-center gap-1 py-[2px] pr-2 text-[9px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600"
                style={{ paddingLeft: (depth + 1) * 14 + 6 }}
              >
                <Circle size={4} className="fill-gray-400 dark:fill-gray-600" />
                Foreign Keys ({foreignKeys.length})
              </div>
              {foreignKeys.map((fk) => <FKLeaf key={fk.constraint_name} fk={fk} depth={depth + 1} />)}
            </>
          )}

          {loading && (
            <div
              className="flex items-center gap-1.5 py-1 text-xs text-gray-400"
              style={{ paddingLeft: (depth + 1) * 14 + 6 }}
            >
              <Loader2 size={10} className="animate-spin" />
              Loading...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Object leaf (view/trigger/procedure/function/sequence) ──

function ObjectLeaf({
  name,
  type,
  depth,
  selected,
  onSelect,
  onContextMenu,
}: {
  name: string;
  type: string;
  depth: number;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`flex items-center gap-1 py-[3px] pr-2 text-xs cursor-pointer select-none transition-colors ${
        selected
          ? "bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200"
          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
      }`}
      style={{ paddingLeft: depth * 14 + 6 }}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      <span className="w-4 flex-shrink-0" />
      <span className="flex-shrink-0">{typeIcon(type)}</span>
      <span className="truncate">{name}</span>
    </div>
  );
}

// ── Main SchemaTree ──

export function SchemaTree() {
  const { connectedId } = useConnectionStore();
  const {
    databases,
    expandedDbs,
    schemaItems,
    expandedTables,
    tableColumns,
    tableIndexes,
    tableForeignKeys,
    loading,
    selectedObject,
    loadDatabases,
    toggleDatabase,
    toggleTable,
    selectObject,
    setContextMenu,
  } = useSchemaStore();

  const [filter, setFilter] = useState("");
  const dbLoading = loading["databases"];

  const initLoad = useCallback(() => {
    if (connectedId && databases.length === 0 && !dbLoading) {
      loadDatabases(connectedId);
    }
  }, [connectedId, databases.length, dbLoading, loadDatabases]);

  if (connectedId && databases.length === 0 && !dbLoading) {
    initLoad();
  }

  if (!connectedId) return null;

  const handleContextMenu = (
    e: React.MouseEvent,
    type: string,
    database: string,
    object: string,
  ) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type, database, object });
  };

  const handleObjectSelect = (
    database: string,
    name: string,
    type: SelectedObject["type"],
  ) => {
    if (connectedId) {
      selectObject(connectedId, { database, name, type });
    }
  };

  return (
    <div className="flex flex-col overflow-hidden flex-1">
      {/* Filter */}
      <div className="border-b border-gray-200 dark:border-gray-700 px-2 py-1.5">
        <div className="flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs">
          <Filter size={11} className="text-gray-400 flex-shrink-0" />
          <input
            className="flex-1 border-none bg-transparent outline-none text-gray-700 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Tree container — important: overflow-y-auto + custom scrollbar */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1 scrollbar-thin">
        {dbLoading && databases.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-gray-400">
            <Loader2 size={13} className="animate-spin" />
            Loading databases...
          </div>
        )}

        {!dbLoading && databases.length === 0 && (
          <p className="px-3 py-4 text-xs text-gray-400 text-center">
            No databases found
          </p>
        )}

        {databases.map((db) => {
          const dbExpanded = expandedDbs[db];
          const dbItems = schemaItems[db] ?? [];

          const filtered =
            filter.trim() === ""
              ? dbItems
              : dbItems.filter((item) =>
                  item.name.toLowerCase().includes(filter.toLowerCase()),
                );

          const tableItems = filtered.filter((i) => i.item_type === "table");
          const viewItems = filtered.filter((i) => i.item_type === "view");
          const routineItems = filtered.filter(
            (i) => i.item_type === "procedure" || i.item_type === "function",
          );
          const triggerItems = filtered.filter((i) => i.item_type === "trigger");
          const sequenceItems = filtered.filter((i) => i.item_type === "sequence");

          const hasFilterMatch =
            filter.trim() === "" ||
            filtered.length > 0 ||
            db.toLowerCase().includes(filter.toLowerCase());

          if (!hasFilterMatch) return null;

          // Show counts per type
          const totalTables = schemaItems[db]?.filter((i) => i.item_type === "table").length ?? 0;
          const totalViews = schemaItems[db]?.filter((i) => i.item_type === "view").length ?? 0;

          return (
            <TreeNode
              key={db}
              label={
                <span>
                  {db}{" "}
                  <span className="text-[9px] text-gray-400 dark:text-gray-500 font-normal">
                    ({totalTables}t, {totalViews}v)
                  </span>
                </span>
              }
              icon={<Database size={13} className="text-amber-500" />}
              depth={0}
              expanded={dbExpanded}
              loading={loading[`db:${db}`]}
              onToggle={() => connectedId && toggleDatabase(connectedId, db)}
              onContextMenu={(e) => handleContextMenu(e, "database", db, db)}
              selected={false}
            >
              {dbExpanded && (
                <div>
                  {/* Separator */}
                  {tableItems.length > 0 && (
                    <div
                      className="flex items-center gap-1 py-[3px] pr-2 text-[9px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400"
                      style={{ paddingLeft: 20 }}
                    >
                      Tables ({tableItems.length})
                    </div>
                  )}
                  {tableItems.map((tbl) => {
                    const tblKey = `${db}.${tbl.name}`;
                    const isExpanded = expandedTables[tblKey];
                    const isSel = isSelected(selectedObject, db, tbl.name, "table");
                    return (
                      <TableNode
                        key={tblKey}
                        name={tbl.name}
                        depth={1}
                        expanded={isExpanded ?? false}
                        loading={loading[`tbl:${tblKey}`] ?? false}
                        selected={isSel}
                        columns={tableColumns[tblKey]}
                        indexes={tableIndexes[tblKey]}
                        foreignKeys={tableForeignKeys[tblKey]}
                        onToggle={() => toggleTable(connectedId, db, tbl.name)}
                        onSelect={() => handleObjectSelect(db, tbl.name, "table")}
                        onContextMenu={(e) => handleContextMenu(e, "table", db, tbl.name)}
                      />
                    );
                  })}

                  {/* Views */}
                  {viewItems.length > 0 && (
                    <div
                      className="flex items-center gap-1 py-[3px] pr-2 text-[9px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mt-1"
                      style={{ paddingLeft: 20 }}
                    >
                      Views ({viewItems.length})
                    </div>
                  )}
                  {viewItems.map((v) => (
                    <ObjectLeaf
                      key={`view-${v.name}`}
                      name={v.name}
                      type="view"
                      depth={1}
                      selected={isSelected(selectedObject, db, v.name, "view")}
                      onSelect={() => handleObjectSelect(db, v.name, "view")}
                      onContextMenu={(e) => handleContextMenu(e, "view", db, v.name)}
                    />
                  ))}

                  {/* Sequences */}
                  {sequenceItems.length > 0 && (
                    <div
                      className="flex items-center gap-1 py-[3px] pr-2 text-[9px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mt-1"
                      style={{ paddingLeft: 20 }}
                    >
                      Sequences ({sequenceItems.length})
                    </div>
                  )}
                  {sequenceItems.map((s) => (
                    <ObjectLeaf
                      key={`seq-${s.name}`}
                      name={s.name}
                      type="sequence"
                      depth={1}
                      selected={isSelected(selectedObject, db, s.name, "sequence")}
                      onSelect={() => handleObjectSelect(db, s.name, "sequence")}
                      onContextMenu={(e) => handleContextMenu(e, "sequence", db, s.name)}
                    />
                  ))}

                  {/* Routines */}
                  {routineItems.length > 0 && (
                    <div
                      className="flex items-center gap-1 py-[3px] pr-2 text-[9px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mt-1"
                      style={{ paddingLeft: 20 }}
                    >
                      Routines ({routineItems.length})
                    </div>
                  )}
                  {routineItems.map((r) => (
                    <ObjectLeaf
                      key={`${r.item_type}-${r.name}`}
                      name={r.name}
                      type={r.item_type as "procedure" | "function"}
                      depth={1}
                      selected={isSelected(selectedObject, db, r.name, r.item_type as any)}
                      onSelect={() => handleObjectSelect(db, r.name, r.item_type as "procedure" | "function")}
                      onContextMenu={(e) => handleContextMenu(e, r.item_type, db, r.name)}
                    />
                  ))}

                  {/* Triggers */}
                  {triggerItems.length > 0 && (
                    <div
                      className="flex items-center gap-1 py-[3px] pr-2 text-[9px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mt-1"
                      style={{ paddingLeft: 20 }}
                    >
                      Triggers ({triggerItems.length})
                    </div>
                  )}
                  {triggerItems.map((t) => (
                    <ObjectLeaf
                      key={`trigger-${t.name}`}
                      name={t.name}
                      type="trigger"
                      depth={1}
                      selected={isSelected(selectedObject, db, t.name, "trigger")}
                      onSelect={() => handleObjectSelect(db, t.name, "trigger")}
                      onContextMenu={(e) => handleContextMenu(e, "trigger", db, t.name)}
                    />
                  ))}

                  {dbItems.length === 0 && (
                    <p className="text-xs text-gray-400 py-2" style={{ paddingLeft: 24 }}>
                      No objects
                    </p>
                  )}
                </div>
              )}
            </TreeNode>
          );
        })}
      </div>
    </div>
  );
}
