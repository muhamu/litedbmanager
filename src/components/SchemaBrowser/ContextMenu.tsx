import { useEffect, useRef, useState } from "react";
import {
  Code2, Eye, Table2, FileDown, FileUp, GitCompareArrows, Copy, ClipboardPaste,
  Trash2, Pencil, RefreshCw, Eraser, Unplug, SquareTerminal, ChevronRight, FileCode,
} from "lucide-react";
import { useConnectionStore } from "../../stores/connectionStore";
import { useQueryStore } from "../../stores/queryStore";
import * as api from "../../lib/tauri";
import { useSchemaStore } from "../../stores/schemaStore";
import type { SelectedObject } from "../../stores/schemaStore";

// ── Menu model ──
type Item =
  | { kind: "sep" }
  | { kind: "action"; label: string; icon?: React.ReactNode; shortcut?: string; danger?: boolean; run: () => void | Promise<void> }
  | { kind: "sub"; label: string; icon?: React.ReactNode; items: Item[] };

// ── Helpers ──
function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pickSqlFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".sql,.txt,text/plain";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsText(f);
    };
    input.click();
  });
}

const errMsg = (e: unknown) => (e as { message?: string }).message ?? "Unknown error";

export function ContextMenu() {
  const { contextMenu, closeContextMenu, selectObject, setObjectViewTab, closeObjectViewer, reloadTable, reloadDatabase } = useSchemaStore();
  const { connectedId, profiles, disconnect } = useConnectionStore();
  const { newTab } = useQueryStore();
  const ref = useRef<HTMLDivElement>(null);
  const [openSub, setOpenSub] = useState<string | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    setOpenSub(null);
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeContextMenu();
    };
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") closeContextMenu(); };
    setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleEsc);
    }, 0);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [contextMenu, closeContextMenu]);

  if (!contextMenu || !connectedId) return null;

  const { x, y, type, database, object } = contextMenu;
  const dbType = profiles.find((p) => p.id === connectedId)?.db_type ?? "mysql";

  // ── Identifier quoting per dialect ──
  const quoteId = (id: string) =>
    dbType === "postgres" ? `"${id.replace(/"/g, '""')}"` : `\`${id.replace(/`/g, "``")}\``;
  const fqn = `${quoteId(database)}.${quoteId(object)}`;
  const isNumeric = (t: string) =>
    /\b(int|integer|decimal|numeric|float|double|real|bigint|smallint|tinyint|mediumint|serial|money|bit)\b/i.test(t);
  const sample = (t: string) => (isNumeric(t) ? "0" : "''");
  const sqlLiteral = (v: unknown) =>
    v === null || v === undefined ? "NULL"
      : typeof v === "number" ? String(v)
      : typeof v === "boolean" ? (v ? "1" : "0")
      : /^-?\d+(\.\d+)?$/.test(String(v)) ? String(v)
      : `'${String(v).replace(/'/g, "''")}'`;

  const openInTab = (sql: string) => { closeObjectViewer(); newTab(sql); };

  // ── Generate SQL ──
  const genSelect = async () => {
    const cols = await api.listColumns(connectedId, database, object);
    const list = cols.length ? cols.map((c) => quoteId(c.name)).join(", ") : "*";
    openInTab(`SELECT ${list}\nFROM ${fqn};`);
  };
  const genInsert = async () => {
    const cols = await api.listColumns(connectedId, database, object);
    openInTab(
      `INSERT INTO ${fqn}\n  (${cols.map((c) => quoteId(c.name)).join(", ")})\nVALUES\n  (${cols.map((c) => sample(c.col_type)).join(", ")});`,
    );
  };
  const keyCond = (cols: api.ColumnInfo[]) => {
    const pks = cols.filter((c) => c.key === "PRI");
    const keyCols = pks.length ? pks : cols.slice(0, 1);
    return keyCols.map((c) => `${quoteId(c.name)} = ${sample(c.col_type)}`).join(" AND ") || "1 = 1";
  };
  const genUpdate = async () => {
    const cols = await api.listColumns(connectedId, database, object);
    openInTab(
      `UPDATE ${fqn}\nSET ${cols.map((c) => `${quoteId(c.name)} = ${sample(c.col_type)}`).join(",\n    ")}\nWHERE ${keyCond(cols)};`,
    );
  };
  const genDelete = async () => {
    const cols = await api.listColumns(connectedId, database, object);
    openInTab(`DELETE FROM ${fqn}\nWHERE ${keyCond(cols)};`);
  };
  const genDdl = async () => {
    const ddl = await api.getCreateStatement(connectedId, database, object, type);
    openInTab(ddl.trim().endsWith(";") ? ddl : `${ddl};`);
  };

  // ── Export / dump / import ──
  const exportData = async (fmt: "csv" | "json") => {
    // ponytail: loads the whole table into memory — fine for typical tables; stream if you hit huge ones.
    const data = await api.executeQuery(connectedId, `SELECT * FROM ${fqn}`);
    const res = fmt === "csv"
      ? await api.exportCsv(data.columns, data.rows, ",", true)
      : await api.exportJson(data.columns, data.rows, true);
    download(res.filename, res.data, fmt === "csv" ? "text/csv" : "application/json");
  };
  const dumpSql = async () => {
    const data = await api.executeQuery(connectedId, `SELECT * FROM ${fqn}`);
    let ddl = "";
    try { ddl = await api.getCreateStatement(connectedId, database, object, type); } catch { /* keep going */ }
    const colList = data.columns.map(quoteId).join(", ");
    const lines = [`-- Dump of ${database}.${object} (${data.rows.length} rows)`, ""];
    if (ddl) lines.push(ddl.trim().endsWith(";") ? ddl : `${ddl};`, "");
    for (const row of data.rows) {
      lines.push(`INSERT INTO ${fqn} (${colList}) VALUES (${row.map(sqlLiteral).join(", ")});`);
    }
    download(`${object}.sql`, lines.join("\n"), "application/sql");
  };
  const importSql = async () => {
    const sql = await pickSqlFile();
    if (!sql || !sql.trim()) return;
    try {
      const r = await api.executeQuery(connectedId, sql);
      alert(`SQL executed. Rows affected: ${r.rows_affected}`);
      reloadDatabase(connectedId, database);
    } catch (e) {
      alert(`Import failed: ${errMsg(e)}`);
    }
  };

  // ── Edit ops ──
  const copy = (text: string) => navigator.clipboard.writeText(text).catch(() => {});
  const pasteToTab = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) openInTab(text);
    } catch { alert("Clipboard read not permitted"); }
  };
  const rename = async () => {
    const next = prompt(`Rename ${type} "${object}" to:`, object);
    if (!next || next === object) return;
    if (!/^[A-Za-z0-9_$]+$/.test(next)) { alert("Invalid name (use letters, digits, _ , $)"); return; }
    const sql = dbType === "postgres"
      ? `ALTER TABLE ${fqn} RENAME TO ${quoteId(next)}`
      : `RENAME TABLE ${fqn} TO ${quoteId(database)}.${quoteId(next)}`;
    try { await api.executeQuery(connectedId, sql); reloadDatabase(connectedId, database); }
    catch (e) { alert(`Rename failed: ${errMsg(e)}`); }
  };
  const truncate = async () => {
    if (!confirm(`Truncate ${fqn}?\n\nThis deletes ALL rows and cannot be undone.`)) return;
    try { await api.truncateTable(connectedId, database, object); }
    catch (e) { alert(`Error: ${errMsg(e)}`); }
  };
  const drop = async () => {
    if (!confirm(`DROP ${type.toUpperCase()} ${fqn}?\n\nThis cannot be undone!`)) return;
    try { await api.dropObject(connectedId, database, object, type); reloadDatabase(connectedId, database); }
    catch (e) { alert(`Error: ${errMsg(e)}`); }
  };

  // ── View ──
  const sel: SelectedObject = { database, name: object, type: type as SelectedObject["type"] };
  const viewData = async () => { await selectObject(connectedId, sel); setObjectViewTab("data"); };
  const viewTable = async () => { await selectObject(connectedId, sel); setObjectViewTab("columns"); };

  // ── Build menus per node type ──
  const tabular = type === "table" || type === "view";

  const tableMenu: Item[] = [
    { kind: "sub", label: "Generate SQL", icon: <Code2 size={14} />, items: [
      { kind: "action", label: "SELECT", run: genSelect },
      { kind: "action", label: "INSERT", run: genInsert },
      { kind: "action", label: "UPDATE", run: genUpdate },
      { kind: "action", label: "DELETE", run: genDelete },
      { kind: "sep" },
      { kind: "action", label: "DDL (CREATE)", icon: <FileCode size={14} />, run: genDdl },
    ] },
    { kind: "sep" },
    { kind: "action", label: "View Data", icon: <Eye size={14} />, run: viewData },
    { kind: "action", label: "View Table", icon: <Table2 size={14} />, run: viewTable },
    { kind: "sep" },
    { kind: "sub", label: "Export Data", icon: <FileDown size={14} />, items: [
      { kind: "action", label: "Export as CSV", run: () => exportData("csv") },
      { kind: "action", label: "Export as JSON", run: () => exportData("json") },
    ] },
    { kind: "sub", label: "Compare / Migrate", icon: <GitCompareArrows size={14} />, items: [
      { kind: "action", label: "Dump to SQL file", icon: <FileDown size={14} />, run: dumpSql },
      { kind: "action", label: "Import SQL file", icon: <FileUp size={14} />, run: importSql },
    ] },
    { kind: "sep" },
    { kind: "action", label: "Copy Name", icon: <Copy size={14} />, shortcut: "⌘C", run: () => copy(object) },
    { kind: "action", label: "Copy Qualified Name", run: () => copy(fqn) },
    { kind: "action", label: "Paste", icon: <ClipboardPaste size={14} />, shortcut: "⌘V", run: pasteToTab },
    { kind: "sep" },
    ...(type === "table" ? [{ kind: "action", label: "Truncate", icon: <Eraser size={14} />, danger: true, run: truncate } as Item] : []),
    { kind: "action", label: "Rename", icon: <Pencil size={14} />, shortcut: "F2", run: rename },
    { kind: "action", label: "Delete (Drop)", icon: <Trash2 size={14} />, danger: true, run: drop },
    { kind: "sep" },
    { kind: "action", label: "Refresh", icon: <RefreshCw size={14} />, shortcut: "F5", run: () => reloadTable(connectedId, database, object) },
  ];

  const objectMenu: Item[] = [
    { kind: "action", label: "Show DDL", icon: <FileCode size={14} />, run: genDdl },
    { kind: "action", label: "Copy Name", icon: <Copy size={14} />, run: () => copy(object) },
    { kind: "action", label: "Copy Qualified Name", run: () => copy(fqn) },
    { kind: "sep" },
    { kind: "action", label: "Delete (Drop)", icon: <Trash2 size={14} />, danger: true, run: drop },
    { kind: "action", label: "Refresh", icon: <RefreshCw size={14} />, run: () => reloadDatabase(connectedId, database) },
  ];

  const databaseMenu: Item[] = [
    { kind: "action", label: "SQL Editor", icon: <SquareTerminal size={14} />, run: () => openInTab("") },
    { kind: "sub", label: "Generate SQL", icon: <Code2 size={14} />, items: [
      { kind: "action", label: "CREATE DATABASE", run: () => openInTab(`CREATE DATABASE ${quoteId(object)};`) },
      { kind: "action", label: "DROP DATABASE", danger: true, run: () => openInTab(`DROP DATABASE ${quoteId(object)};`) },
    ] },
    { kind: "sep" },
    { kind: "sub", label: "Compare / Migrate", icon: <GitCompareArrows size={14} />, items: [
      { kind: "action", label: "Import SQL file", icon: <FileUp size={14} />, run: importSql },
    ] },
    { kind: "sep" },
    { kind: "action", label: "Copy Name", icon: <Copy size={14} />, shortcut: "⌘C", run: () => copy(object) },
    { kind: "action", label: "Paste", icon: <ClipboardPaste size={14} />, shortcut: "⌘V", run: pasteToTab },
    { kind: "sep" },
    { kind: "action", label: "Invalidate / Reconnect", icon: <RefreshCw size={14} />, run: () => reloadDatabase(connectedId, object) },
    { kind: "action", label: "Disconnect", icon: <Unplug size={14} />, danger: true, run: () => disconnect(connectedId) },
    { kind: "sep" },
    { kind: "action", label: "Refresh", icon: <RefreshCw size={14} />, shortcut: "F5", run: () => reloadDatabase(connectedId, object) },
  ];

  const items: Item[] =
    type === "database" ? databaseMenu : tabular ? tableMenu : objectMenu;

  // open submenus to the left when near the right screen edge
  const flip = x > window.innerWidth - 380;

  const fire = (run: () => void | Promise<void>) => {
    Promise.resolve(run()).catch((e) => alert(`Error: ${errMsg(e)}`));
    closeContextMenu();
  };

  const renderRow = (item: Item, i: number) => {
    if (item.kind === "sep") return <div key={i} className="my-1 border-t border-gray-200 dark:border-gray-700" />;
    if (item.kind === "sub") {
      const open = openSub === item.label;
      return (
        <div key={i} className="relative" onMouseEnter={() => setOpenSub(item.label)}>
          <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-500 hover:text-white transition-colors">
            <span className="w-4 flex-shrink-0 opacity-70">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            <ChevronRight size={13} className="opacity-60" />
          </button>
          {open && (
            <div className={`absolute top-0 ${flip ? "right-full" : "left-full"} min-w-[190px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2d2d2d] py-1 shadow-xl z-10`}>
              {item.items.map((sub, j) => renderRow(sub, j))}
            </div>
          )}
        </div>
      );
    }
    return (
      <button
        key={i}
        onClick={() => fire(item.run)}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:text-white ${
          item.danger
            ? "text-red-600 dark:text-red-400 hover:bg-red-500"
            : "text-gray-700 dark:text-gray-200 hover:bg-blue-500"
        }`}
      >
        <span className="w-4 flex-shrink-0 opacity-70">{item.icon}</span>
        <span className="flex-1">{item.label}</span>
        {item.shortcut && <span className="text-xs opacity-50">{item.shortcut}</span>}
      </button>
    );
  };

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[210px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2d2d2d] py-1 shadow-xl"
      style={{ left: Math.min(x, window.innerWidth - 230), top: Math.min(y, window.innerHeight - 200) }}
      onMouseLeave={() => setOpenSub(null)}
    >
      {items.map((item, i) => renderRow(item, i))}
    </div>
  );
}
