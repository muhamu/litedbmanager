import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Key, Link2, Hash, AlignLeft,
  Trash2, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown,
  Save, RotateCcw, Filter,
} from "lucide-react";
import type { TableTab } from "../../stores/queryStore";
import { useSchemaStore } from "../../stores/schemaStore";
import { useConnectionStore } from "../../stores/connectionStore";
import * as api from "../../lib/tauri";
import type { ColumnInfo, IndexInfo, ForeignKeyInfo } from "../../lib/tauri";
import { DataEditor } from "../DataEditor";
import { saveToFile, exportCsv, exportJson } from "../../lib/tauri";

type LeftSection = "columns" | "constraints" | "foreignkeys" | "indexes" | "ddl";
type TopSection = "properties" | "data" | "ddl";

const MYSQL_TYPES = [
  "BIGINT","BIGINT UNSIGNED","BINARY","BIT","BLOB","BOOL","BOOLEAN",
  "CHAR","DATE","DATETIME","DECIMAL","DOUBLE","DOUBLE PRECISION",
  "ENUM","FLOAT","INT","INT UNSIGNED","INTEGER","JSON",
  "LONGBLOB","LONGTEXT","MEDIUMBLOB","MEDIUMINT","MEDIUMTEXT",
  "SET","SMALLINT","TEXT","TIME","TIMESTAMP","TINYBLOB",
  "TINYINT","TINYTEXT","VARBINARY","VARCHAR","YEAR",
];
const POSTGRES_TYPES = [
  "BIGINT","BIGSERIAL","BOOLEAN","BYTEA","CHAR","CHARACTER VARYING",
  "DATE","DOUBLE PRECISION","INTEGER","INTERVAL","JSON","JSONB",
  "NUMERIC","REAL","SERIAL","SMALLINT","SMALLSERIAL","TEXT",
  "TIME","TIMESTAMP","TIMESTAMPTZ","TIMETZ","UUID","VARCHAR",
];

// ── Column editing state ──
interface ColEdit {
  col_type?: string;
  nullable?: boolean;
  default?: string | null;
}

// ── Helpers ──
function ColIcon({ col }: { col: ColumnInfo }) {
  if (col.key === "PRI") return <Key size={10} className="text-amber-500 flex-shrink-0" />;
  if (col.key === "MUL") return <Link2 size={10} className="text-violet-500 flex-shrink-0" />;
  if (/\b(int|integer|bigint|smallint|tinyint|mediumint|decimal|numeric|float|double|real|serial|money)\b/i.test(col.col_type))
    return <Hash size={10} className="text-gray-400 flex-shrink-0" />;
  return <AlignLeft size={10} className="text-gray-400 flex-shrink-0" />;
}

function Check({ v }: { v: boolean }) {
  return v
    ? <span className="text-green-500 dark:text-green-400 font-bold">✓</span>
    : <span className="text-gray-300 dark:text-gray-600">—</span>;
}

const TH = ({ children, w }: { children: React.ReactNode; w?: string }) => (
  <th style={w ? { width: w } : undefined} className="bg-gray-100 dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-700 px-2 py-1.5 text-left font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap select-none text-xs sticky top-0 z-10">
    {children}
  </th>
);
const TD = ({ children, center, cls }: { children: React.ReactNode; center?: boolean; cls?: string }) => (
  <td className={`border-r border-gray-100 dark:border-gray-800 px-2 py-1 ${center ? "text-center" : ""} ${cls ?? ""}`}>
    {children}
  </td>
);

// ── Columns section with inline editing ──
function ColumnsSection({
  columns, selectedCol, onSelect, editingCol, colEdits, onEditChange, dbType,
}: {
  columns: ColumnInfo[];
  selectedCol: string | null;
  onSelect: (name: string) => void;
  editingCol: string | null;
  colEdits: Map<string, ColEdit>;
  onEditChange: (name: string, field: keyof ColEdit, value: unknown) => void;
  dbType: string;
}) {
  const [filterText, setFilterText] = useState("");

  const visible = filterText
    ? columns.filter(c => c.name.toLowerCase().includes(filterText.toLowerCase()))
    : columns;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Column filter */}
      <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#2a2a2a]">
        <Filter size={10} className="text-gray-400 flex-shrink-0" />
        <input
          className="flex-1 text-xs bg-transparent outline-none text-gray-700 dark:text-gray-200 placeholder:text-gray-400"
          placeholder="Filter columns…"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
        />
      </div>
      {!visible.length
        ? <div className="flex items-center justify-center h-32 text-xs text-gray-400 dark:text-gray-500">No columns</div>
        : (
          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <TH w="36px">#</TH>
                  <TH>Column Name</TH>
                  <TH>Data Type</TH>
                  <TH w="72px">Not Null</TH>
                  <TH w="96px">Auto Incr.</TH>
                  <TH w="48px">Key</TH>
                  <TH>Default</TH>
                  <TH>Extra</TH>
                </tr>
              </thead>
              <tbody>
                {visible.map((col, idx) => {
                  const isSelected = selectedCol === col.name;
                  const isEditing = editingCol === col.name;
                  const edit = colEdits.get(col.name) ?? {};
                  const displayType = edit.col_type ?? col.col_type;
                  const displayNullable = edit.nullable ?? col.nullable;
                  const displayDefault = "default" in edit ? edit.default : col.default;
                  const hasEdit = colEdits.has(col.name);

                  return (
                    <tr
                      key={col.name}
                      onClick={() => onSelect(col.name)}
                      className={`border-b border-gray-100 dark:border-gray-800 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-blue-100 dark:bg-blue-900/40"
                          : hasEdit
                          ? "bg-yellow-50 dark:bg-yellow-900/10"
                          : "hover:bg-blue-50/60 dark:hover:bg-blue-900/20"
                      }`}
                    >
                      <TD center><span className="text-gray-400 dark:text-gray-600 tabular-nums">{idx + 1}</span></TD>
                      <TD>
                        <div className="flex items-center gap-1.5">
                          <ColIcon col={col} />
                          <span className="font-mono text-gray-800 dark:text-gray-200">{col.name}</span>
                        </div>
                      </TD>
                      <TD>
                        {isEditing ? (
                          <select
                            className="w-full text-xs font-mono px-1 py-0.5 border border-blue-400 rounded bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 outline-none cursor-pointer"
                            value={displayType}
                            onClick={e => e.stopPropagation()}
                            onChange={e => onEditChange(col.name, "col_type", e.target.value)}
                          >
                            {/* Keep current value even if not in list */}
                            {!(dbType === "postgres" ? POSTGRES_TYPES : MYSQL_TYPES).includes(displayType.toUpperCase()) && (
                              <option value={displayType}>{displayType}</option>
                            )}
                            {(dbType === "postgres" ? POSTGRES_TYPES : MYSQL_TYPES).map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-mono text-blue-600 dark:text-blue-400">{displayType}</span>
                        )}
                      </TD>
                      <TD center>
                        {isEditing ? (
                          <input
                            type="checkbox"
                            checked={!displayNullable}
                            onClick={e => e.stopPropagation()}
                            onChange={e => onEditChange(col.name, "nullable", !e.target.checked)}
                            className="cursor-pointer"
                          />
                        ) : <Check v={!displayNullable} />}
                      </TD>
                      <TD center><Check v={col.extra.toLowerCase().includes("auto_increment")} /></TD>
                      <TD center>
                        {col.key && (
                          <span className={`text-[9px] font-bold px-1 rounded ${
                            col.key === "PRI" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                            : col.key === "UNI" ? "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300"
                            : "bg-violet-100 text-violet-600 dark:bg-violet-900/50 dark:text-violet-300"
                          }`}>{col.key}</span>
                        )}
                      </TD>
                      <TD>
                        {isEditing ? (
                          <input
                            className="w-full text-xs font-mono px-1 py-0.5 border border-blue-400 rounded bg-white dark:bg-gray-900 outline-none"
                            value={displayDefault ?? ""}
                            placeholder="NULL"
                            onClick={e => e.stopPropagation()}
                            onChange={e => onEditChange(col.name, "default", e.target.value || null)}
                          />
                        ) : (
                          <span className="font-mono text-gray-500 dark:text-gray-400">
                            {displayDefault ?? <span className="italic text-gray-300 dark:text-gray-600">NULL</span>}
                          </span>
                        )}
                      </TD>
                      <TD><span className="font-mono text-gray-400 dark:text-gray-500">{col.extra}</span></TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

function ConstraintsSection({ indexes }: { indexes: IndexInfo[] }) {
  const c = indexes.filter(i => i.unique);
  if (!c.length) return <div className="flex items-center justify-center h-32 text-xs text-gray-400 dark:text-gray-500">No constraints</div>;
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead><tr><TH>Name</TH><TH>Columns</TH><TH>Type</TH></tr></thead>
        <tbody>
          {c.map(idx => (
            <tr key={idx.name} className="border-b border-gray-100 dark:border-gray-800 hover:bg-blue-50/60 dark:hover:bg-blue-900/20">
              <TD><span className="font-mono text-gray-700 dark:text-gray-300">{idx.name}</span></TD>
              <TD><span className="font-mono text-gray-500 dark:text-gray-400">{idx.columns.join(", ")}</span></TD>
              <TD>
                <span className={`text-[9px] font-bold px-1.5 rounded ${idx.name === "PRIMARY" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" : "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300"}`}>
                  {idx.name === "PRIMARY" ? "PRIMARY KEY" : "UNIQUE"}
                </span>
              </TD>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FKSection({ fks }: { fks: ForeignKeyInfo[] }) {
  if (!fks.length) return <div className="flex items-center justify-center h-32 text-xs text-gray-400 dark:text-gray-500">No foreign keys</div>;
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead><tr><TH>Constraint</TH><TH>Column</TH><TH>References</TH><TH>Ref Column</TH></tr></thead>
        <tbody>
          {fks.map(fk => (
            <tr key={fk.constraint_name} className="border-b border-gray-100 dark:border-gray-800 hover:bg-blue-50/60 dark:hover:bg-blue-900/20">
              <TD><span className="font-mono text-gray-600 dark:text-gray-400">{fk.constraint_name}</span></TD>
              <TD><span className="font-mono text-gray-700 dark:text-gray-300">{fk.column}</span></TD>
              <TD><span className="font-mono text-violet-600 dark:text-violet-400">{fk.ref_database}.{fk.ref_table}</span></TD>
              <TD><span className="font-mono text-gray-500 dark:text-gray-400">{fk.ref_column}</span></TD>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IndexesSection({ indexes }: { indexes: IndexInfo[] }) {
  if (!indexes.length) return <div className="flex items-center justify-center h-32 text-xs text-gray-400 dark:text-gray-500">No indexes</div>;
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead><tr><TH>Name</TH><TH>Columns</TH><TH w="56px">Unique</TH><TH>Type</TH></tr></thead>
        <tbody>
          {indexes.map(idx => (
            <tr key={idx.name} className="border-b border-gray-100 dark:border-gray-800 hover:bg-blue-50/60 dark:hover:bg-blue-900/20">
              <TD><span className="font-mono text-gray-700 dark:text-gray-300">{idx.name}</span></TD>
              <TD><span className="font-mono text-gray-500 dark:text-gray-400">{idx.columns.join(", ")}</span></TD>
              <TD center><Check v={idx.unique} /></TD>
              <TD><span className="text-gray-500 dark:text-gray-400 uppercase text-[10px]">{idx.index_type}</span></TD>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Properties toolbar icon button ──
function PBtn({
  icon, label, onClick, disabled, danger, highlight,
}: {
  icon: React.ReactNode; label?: string; onClick: () => void;
  disabled?: boolean; danger?: boolean; highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        danger ? "text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
        : highlight ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200"
        : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
      }`}
    >
      {icon}{label && <span>{label}</span>}
    </button>
  );
}

// ── Main TableViewer ──
export function TableViewer({ tab }: { tab: TableTab }) {
  const { connectedId } = useConnectionStore();
  const { tableColumns, tableIndexes, tableForeignKeys } = useSchemaStore();
  const tblKey = `${tab.database}.${tab.tableName}`;

  const [topTab, setTopTab] = useState<TopSection>(tab.defaultSection ?? "properties");
  const [leftSection, setLeftSection] = useState<LeftSection>("columns");
  const [localCols, setLocalCols] = useState<ColumnInfo[] | null>(null);
  const [localIdxs, setLocalIdxs] = useState<IndexInfo[] | null>(null);
  const [localFks, setLocalFks] = useState<ForeignKeyInfo[] | null>(null);
  const [ddl, setDdl] = useState<string>("Loading...");
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Column editing state
  const [selectedCol, setSelectedCol] = useState<string | null>(null);
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [colEdits, setColEdits] = useState<Map<string, ColEdit>>(new Map());
  const [pendingDrops, setPendingDrops] = useState<Set<string>>(new Set());
  const [colSaving, setColSaving] = useState(false);

  const dbType = useConnectionStore(s => s.profiles.find(p => p.id === connectedId)?.db_type ?? "mysql");

  const columns = tableColumns[tblKey] ?? localCols ?? [];
  const indexes = tableIndexes[tblKey] ?? localIdxs ?? [];
  const foreignKeys = tableForeignKeys[tblKey] ?? localFks ?? [];
  const pkCols = columns.filter(c => c.key === "PRI").map(c => c.name);

  const quoteId = (id: string) =>
    dbType === "postgres" ? `"${id.replace(/"/g, '""')}"` : `\`${id.replace(/`/g, "``")}\``;
  const fqn = `${quoteId(tab.database)}.${quoteId(tab.tableName)}`;
  const sqlVal = (v: unknown) => v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "\\'")}'`;

  const reload = useCallback(() => {
    if (!connectedId) return;
    setLocalCols(null); setLocalIdxs(null); setLocalFks(null);
    api.listColumns(connectedId, tab.database, tab.tableName).then(setLocalCols).catch(() => {});
    api.listIndexes(connectedId, tab.database, tab.tableName).then(setLocalIdxs).catch(() => {});
    api.listForeignKeys(connectedId, tab.database, tab.tableName).then(setLocalFks).catch(() => {});
    api.getCreateStatement(connectedId, tab.database, tab.tableName, tab.objType)
      .then(setDdl).catch(() => setDdl("-- Error loading DDL"));
    if (tab.objType === "table")
      api.countTableRows(connectedId, tab.database, tab.tableName).then(setRowCount).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedId, tblKey, tab.objType]);

  useEffect(() => { reload(); }, [reload, refreshKey]);

  // ── Column edit handlers ──
  const handleEditChange = (name: string, field: keyof ColEdit, value: unknown) => {
    setColEdits(prev => {
      const next = new Map(prev);
      next.set(name, { ...(next.get(name) ?? {}), [field]: value });
      return next;
    });
  };

  const colDef = (col: ColumnInfo) => {
    const e = colEdits.get(col.name) ?? {};
    const type = e.col_type ?? col.col_type;
    const nullable = e.nullable ?? col.nullable;
    const def = "default" in e ? e.default : col.default;
    const extra = col.extra ? ` ${col.extra.toUpperCase()}` : "";
    const nullStr = nullable ? "" : " NOT NULL";
    const defStr = def != null ? ` DEFAULT ${sqlVal(def)}` : "";
    return `${quoteId(col.name)} ${type}${nullStr}${defStr}${extra}`;
  };

  const saveColChanges = async () => {
    if (!connectedId) return;
    setColSaving(true);
    try {
      // DROP columns
      for (const colName of pendingDrops) {
        if (!confirm(`DROP COLUMN ${colName}? This cannot be undone.`)) continue;
        await api.executeQuery(connectedId, `ALTER TABLE ${fqn} DROP COLUMN ${quoteId(colName)};`);
      }

      // MODIFY columns
      for (const [colName, _] of colEdits) {
        const col = columns.find(c => c.name === colName);
        if (!col) continue;
        const e = colEdits.get(colName) ?? {};

        if (dbType === "postgres") {
          const type = e.col_type ?? col.col_type;
          const nullable = e.nullable ?? col.nullable;
          const def = "default" in e ? e.default : col.default;
          if (e.col_type) await api.executeQuery(connectedId, `ALTER TABLE ${fqn} ALTER COLUMN ${quoteId(colName)} TYPE ${type};`);
          if ("nullable" in e) await api.executeQuery(connectedId, `ALTER TABLE ${fqn} ALTER COLUMN ${quoteId(colName)} ${nullable ? "DROP NOT NULL" : "SET NOT NULL"};`);
          if ("default" in e) await api.executeQuery(connectedId, def != null ? `ALTER TABLE ${fqn} ALTER COLUMN ${quoteId(colName)} SET DEFAULT ${sqlVal(def)};` : `ALTER TABLE ${fqn} ALTER COLUMN ${quoteId(colName)} DROP DEFAULT;`);
        } else {
          await api.executeQuery(connectedId, `ALTER TABLE ${fqn} MODIFY COLUMN ${colDef(col)};`);
        }
      }

      setColEdits(new Map());
      setPendingDrops(new Set());
      setEditingCol(null);
      setRefreshKey(k => k + 1);
    } catch (e) {
      alert(`Save failed: ${(e as { message?: string }).message ?? e}`);
    } finally {
      setColSaving(false);
    }
  };

  const dropSelectedCol = () => {
    if (!selectedCol) return;
    setPendingDrops(prev => new Set([...prev, selectedCol]));
    setSelectedCol(null);
  };

  const moveCol = async (direction: "up" | "down" | "first" | "last") => {
    if (!selectedCol || !connectedId) return;
    if (dbType === "postgres") { alert("Column reordering is not supported in PostgreSQL"); return; }
    const idx = columns.findIndex(c => c.name === selectedCol);
    if (idx < 0) return;
    const col = columns[idx];
    if (!col) return;

    let afterClause = "";
    if (direction === "first") afterClause = "FIRST";
    else if (direction === "last") { const last = columns[columns.length - 1]; if (last) afterClause = `AFTER ${quoteId(last.name)}`; }
    else if (direction === "up" && idx > 0) { const prev = columns[idx - 2]; afterClause = idx === 1 ? "FIRST" : (prev ? `AFTER ${quoteId(prev.name)}` : ""); }
    else if (direction === "down" && idx < columns.length - 1) { const next = columns[idx + 1]; if (next) afterClause = `AFTER ${quoteId(next.name)}`; }

    if (!afterClause) return;
    try {
      await api.executeQuery(connectedId, `ALTER TABLE ${fqn} MODIFY COLUMN ${colDef(col)} ${afterClause};`);
      setRefreshKey(k => k + 1);
    } catch (e) {
      alert(`Reorder failed: ${(e as { message?: string }).message ?? e}`);
    }
  };

  const hasColChanges = colEdits.size > 0 || pendingDrops.size > 0;

  // ── Export helpers — receive data already loaded by DataEditor ──
  const handleExport = async (fmt: "csv" | "json", cols: string[], rows: unknown[][]) => {
    try {
      const res = fmt === "csv"
        ? await exportCsv(cols, rows, ",", true)
        : await exportJson(cols, rows, true);
      await saveToFile(res.data, `${tab.tableName}.${fmt}`, fmt);
    } catch (e) {
      alert(`Export failed: ${(e as { message?: string }).message ?? e}`);
    }
  };

  const DdlPane = () => (
    <div className="flex-1 overflow-auto p-4">
      <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 whitespace-pre-wrap break-all">
        {ddl}
      </pre>
    </div>
  );

  const leftNav: { id: LeftSection; label: string; count?: number }[] = [
    { id: "columns", label: "Columns", count: columns.length || undefined },
    { id: "constraints", label: "Constraints", count: indexes.filter(i => i.unique).length || undefined },
    { id: "foreignkeys", label: "Foreign Keys", count: foreignKeys.length || undefined },
    { id: "indexes", label: "Indexes", count: indexes.length || undefined },
    { id: "ddl", label: "DDL" },
  ];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#1e1e1e]">
      {/* Top tabs */}
      <div className="flex-shrink-0 flex items-center border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#252526]">
        {(["properties", "data", "ddl"] as TopSection[]).map(t => (
          <button key={t} onClick={() => setTopTab(t)}
            className={`px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${
              topTab === t
                ? "border-blue-500 text-blue-700 dark:text-blue-400 bg-white dark:bg-[#1e1e1e]"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {t === "ddl" ? "DDL" : t === "properties" ? "Properties" : "Data"}
          </button>
        ))}
        {rowCount !== null && (
          <span className="ml-auto pr-3 text-xs text-gray-400 dark:text-gray-500">
            ~{rowCount.toLocaleString()} rows
          </span>
        )}
      </div>

      {/* Body */}
      {topTab === "data" ? (
        connectedId ? (
          <DataEditor
            profileId={connectedId}
            database={tab.database}
            tableName={tab.tableName}
            pkCols={pkCols}
            columnDefs={columns}
            dbType={dbType}
            onExportCsv={(cols, rows) => handleExport("csv", cols, rows)}
            onExportJson={(cols, rows) => handleExport("json", cols, rows)}
          />
        ) : null
      ) : topTab === "ddl" ? (
        <DdlPane />
      ) : (
        /* Properties: left nav + right content + bottom toolbar */
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            {/* Left nav */}
            <div className="w-40 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#252526] overflow-y-auto">
              {leftNav.map(item => (
                <button key={item.id} onClick={() => setLeftSection(item.id)}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${
                    leftSection === item.id
                      ? "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.count !== undefined && (
                    <span className="text-[9px] text-gray-400 dark:text-gray-500">{item.count}</span>
                  )}
                </button>
              ))}
            </div>
            {/* Right content */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {leftSection === "columns" && (
                <ColumnsSection
                  columns={columns}
                  selectedCol={selectedCol}
                  onSelect={col => {
                    setSelectedCol(col);
                    setEditingCol(col);
                  }}
                  editingCol={editingCol}
                  colEdits={colEdits}
                  onEditChange={handleEditChange}
                  dbType={dbType}
                />
              )}
              {leftSection === "constraints" && <ConstraintsSection indexes={indexes} />}
              {leftSection === "foreignkeys" && <FKSection fks={foreignKeys} />}
              {leftSection === "indexes" && <IndexesSection indexes={indexes} />}
              {leftSection === "ddl" && <DdlPane />}
            </div>
          </div>

          {/* Properties bottom toolbar (matches screenshot 7.37.45) */}
          {leftSection === "columns" && (
            <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#252526] px-2 py-1 flex items-center gap-0.5">
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
              <PBtn
                icon={<Trash2 size={12} />}
                label="Delete"
                onClick={dropSelectedCol}
                disabled={!selectedCol || pendingDrops.has(selectedCol ?? "")}
                danger
              />
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
              <PBtn icon={<ChevronsUp size={12} />} label="First" onClick={() => moveCol("first")} disabled={!selectedCol} />
              <PBtn icon={<ArrowUp size={12} />} label="Up" onClick={() => moveCol("up")} disabled={!selectedCol} />
              <PBtn icon={<ArrowDown size={12} />} label="Down" onClick={() => moveCol("down")} disabled={!selectedCol} />
              <PBtn icon={<ChevronsDown size={12} />} label="Last" onClick={() => moveCol("last")} disabled={!selectedCol} />
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
              <PBtn
                icon={<Save size={12} />}
                label={colSaving ? "Saving…" : "Save…"}
                onClick={saveColChanges}
                disabled={!hasColChanges || colSaving}
                highlight={hasColChanges}
              />
              <PBtn
                icon={<RotateCcw size={12} />}
                label="Revert"
                onClick={() => { setColEdits(new Map()); setPendingDrops(new Set()); setEditingCol(null); }}
                disabled={!hasColChanges}
              />
              <PBtn
                icon={<RefreshCw size={12} />}
                label="Refresh"
                onClick={() => setRefreshKey(k => k + 1)}
              />
            </div>
          )}
          {leftSection !== "columns" && (
            <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#252526] px-2 py-1 flex items-center">
              <PBtn icon={<RefreshCw size={12} />} label="Refresh" onClick={() => setRefreshKey(k => k + 1)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
