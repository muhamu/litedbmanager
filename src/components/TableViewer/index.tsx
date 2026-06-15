import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Key, Link2, Hash, AlignLeft } from "lucide-react";
import type { TableTab } from "../../stores/queryStore";
import { useSchemaStore } from "../../stores/schemaStore";
import { useConnectionStore } from "../../stores/connectionStore";
import * as api from "../../lib/tauri";
import type { ColumnInfo, IndexInfo, ForeignKeyInfo, QueryResult } from "../../lib/tauri";
import { ResultGrid } from "../ResultGrid";

type LeftSection = "columns" | "constraints" | "foreignkeys" | "indexes" | "ddl";
type TopSection = "properties" | "data" | "ddl";

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

const TH = ({ children }: { children: React.ReactNode }) => (
  <th className="bg-gray-100 dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-700 px-2 py-1.5 text-left font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap select-none text-xs">
    {children}
  </th>
);
const TD = ({ children, center }: { children: React.ReactNode; center?: boolean }) => (
  <td className={`border-r border-gray-100 dark:border-gray-800 px-2 py-1 ${center ? "text-center" : ""}`}>
    {children}
  </td>
);

function ColumnsSection({ columns }: { columns: ColumnInfo[] }) {
  if (!columns.length)
    return <div className="flex items-center justify-center h-32 text-xs text-gray-400 dark:text-gray-500">No columns loaded</div>;
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="sticky top-0 z-10">
            <TH>#</TH>
            <TH>Column Name</TH>
            <TH>Data Type</TH>
            <TH>Not Null</TH>
            <TH>Auto Increment</TH>
            <TH>Key</TH>
            <TH>Default</TH>
            <TH>Extra</TH>
          </tr>
        </thead>
        <tbody>
          {columns.map((col, idx) => (
            <tr key={col.name} className="border-b border-gray-100 dark:border-gray-800 hover:bg-blue-50/60 dark:hover:bg-blue-900/20 transition-colors">
              <TD center><span className="text-gray-400 dark:text-gray-600 tabular-nums">{idx + 1}</span></TD>
              <TD>
                <div className="flex items-center gap-1.5">
                  <ColIcon col={col} />
                  <span className="font-mono text-gray-800 dark:text-gray-200">{col.name}</span>
                </div>
              </TD>
              <TD><span className="font-mono text-blue-600 dark:text-blue-400">{col.col_type}</span></TD>
              <TD center><Check v={!col.nullable} /></TD>
              <TD center><Check v={col.extra.toLowerCase().includes("auto_increment")} /></TD>
              <TD center>
                {col.key && (
                  <span className={`text-[9px] font-bold px-1 rounded ${
                    col.key === "PRI"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                      : col.key === "UNI"
                      ? "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300"
                      : "bg-violet-100 text-violet-600 dark:bg-violet-900/50 dark:text-violet-300"
                  }`}>{col.key}</span>
                )}
              </TD>
              <TD>
                <span className="font-mono text-gray-500 dark:text-gray-400">
                  {col.default ?? <span className="text-gray-300 dark:text-gray-600 italic">NULL</span>}
                </span>
              </TD>
              <TD><span className="font-mono text-gray-400 dark:text-gray-500">{col.extra}</span></TD>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConstraintsSection({ indexes }: { indexes: IndexInfo[] }) {
  const constraints = indexes.filter((i) => i.unique);
  if (!constraints.length)
    return <div className="flex items-center justify-center h-32 text-xs text-gray-400 dark:text-gray-500">No constraints</div>;
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="sticky top-0 z-10">
            <TH>Name</TH><TH>Columns</TH><TH>Type</TH>
          </tr>
        </thead>
        <tbody>
          {constraints.map((idx) => (
            <tr key={idx.name} className="border-b border-gray-100 dark:border-gray-800 hover:bg-blue-50/60 dark:hover:bg-blue-900/20">
              <TD><span className="font-mono text-gray-700 dark:text-gray-300">{idx.name}</span></TD>
              <TD><span className="font-mono text-gray-500 dark:text-gray-400">{idx.columns.join(", ")}</span></TD>
              <TD>
                <span className={`text-[9px] font-bold px-1.5 rounded ${
                  idx.name === "PRIMARY"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                    : "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300"
                }`}>
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
  if (!fks.length)
    return <div className="flex items-center justify-center h-32 text-xs text-gray-400 dark:text-gray-500">No foreign keys</div>;
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="sticky top-0 z-10">
            <TH>Constraint</TH><TH>Column</TH><TH>References</TH><TH>Ref Column</TH>
          </tr>
        </thead>
        <tbody>
          {fks.map((fk) => (
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
  if (!indexes.length)
    return <div className="flex items-center justify-center h-32 text-xs text-gray-400 dark:text-gray-500">No indexes</div>;
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="sticky top-0 z-10">
            <TH>Name</TH><TH>Columns</TH><TH>Unique</TH><TH>Type</TH>
          </tr>
        </thead>
        <tbody>
          {indexes.map((idx) => (
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
  const [data, setData] = useState<QueryResult | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const columns = tableColumns[tblKey] ?? localCols ?? [];
  const indexes = tableIndexes[tblKey] ?? localIdxs ?? [];
  const foreignKeys = tableForeignKeys[tblKey] ?? localFks ?? [];

  const reload = useCallback(() => {
    if (!connectedId) return;
    setLocalCols(null);
    setLocalIdxs(null);
    setLocalFks(null);
    api.listColumns(connectedId, tab.database, tab.tableName).then(setLocalCols).catch(() => {});
    api.listIndexes(connectedId, tab.database, tab.tableName).then(setLocalIdxs).catch(() => {});
    api.listForeignKeys(connectedId, tab.database, tab.tableName).then(setLocalFks).catch(() => {});
    api.getCreateStatement(connectedId, tab.database, tab.tableName, tab.objType)
      .then(setDdl).catch(() => setDdl("-- Error loading DDL"));
    if (tab.objType === "table") {
      api.countTableRows(connectedId, tab.database, tab.tableName).then(setRowCount).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedId, tblKey, tab.objType]);

  useEffect(() => { reload(); }, [reload, refreshKey]);

  useEffect(() => {
    if (topTab !== "data" || !connectedId) return;
    setDataLoading(true);
    api.showTableData(connectedId, tab.database, tab.tableName, 200, 0)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setDataLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topTab, connectedId, tblKey]);

  const leftNav: { id: LeftSection; label: string; count?: number }[] = [
    { id: "columns", label: "Columns", count: columns.length || undefined },
    { id: "constraints", label: "Constraints", count: indexes.filter((i) => i.unique).length || undefined },
    { id: "foreignkeys", label: "Foreign Keys", count: foreignKeys.length || undefined },
    { id: "indexes", label: "Indexes", count: indexes.length || undefined },
    { id: "ddl", label: "DDL" },
  ];

  const DdlPane = () => (
    <div className="flex-1 overflow-auto p-4">
      <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 whitespace-pre-wrap break-all">
        {ddl}
      </pre>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#1e1e1e]">
      {/* Top tabs */}
      <div className="flex-shrink-0 flex items-center border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#252526]">
        {(["properties", "data", "ddl"] as TopSection[]).map((t) => (
          <button
            key={t}
            onClick={() => setTopTab(t)}
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
        <div className="flex-1 overflow-hidden flex flex-col">
          {dataLoading
            ? <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-500">Loading data...</div>
            : <ResultGrid result={data} error={null} running={false} />}
        </div>
      ) : topTab === "ddl" ? (
        <DdlPane />
      ) : (
        /* Properties: left nav + content */
        <div className="flex flex-1 overflow-hidden">
          <div className="w-40 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#252526] overflow-y-auto">
            {leftNav.map((item) => (
              <button
                key={item.id}
                onClick={() => setLeftSection(item.id)}
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
          <div className="flex-1 overflow-hidden flex flex-col">
            {leftSection === "columns" && <ColumnsSection columns={columns} />}
            {leftSection === "constraints" && <ConstraintsSection indexes={indexes} />}
            {leftSection === "foreignkeys" && <FKSection fks={foreignKeys} />}
            {leftSection === "indexes" && <IndexesSection indexes={indexes} />}
            {leftSection === "ddl" && <DdlPane />}
          </div>
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#252526] px-2 py-1 flex items-center">
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
        >
          <RefreshCw size={11} />
          Refresh
        </button>
      </div>
    </div>
  );
}
