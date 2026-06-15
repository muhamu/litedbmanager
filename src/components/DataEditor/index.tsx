import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Plus, Trash2, Copy, Save, RotateCcw, RefreshCw,
  ChevronFirst, ChevronLast, ChevronLeft, ChevronRight,
  Filter, Download,
} from "lucide-react";
import * as api from "../../lib/tauri";
import type { ColumnInfo } from "../../lib/tauri";

interface DataEditorProps {
  profileId: string;
  database: string;
  tableName: string;
  pkCols: string[];
  columnDefs: ColumnInfo[];
  dbType: string;
  onExportCsv?: (cols: string[], rows: unknown[][]) => void;
  onExportJson?: (cols: string[], rows: unknown[][]) => void;
}

const SQL_KEYWORDS = [
  "AND", "OR", "NOT", "LIKE", "ILIKE", "IN", "IS NULL", "IS NOT NULL",
  "BETWEEN", "ORDER BY", "ASC", "DESC", "LIMIT", "GROUP BY", "HAVING",
  "TRUE", "FALSE", "NULL", "CURRENT_TIMESTAMP",
];
const OPERATORS = ["=", "!=", "<>", ">", "<", ">=", "<="];

function FilterBar({
  value, onChange, onApply, columns,
}: {
  value: string; onChange: (v: string) => void; onApply: () => void; columns: string[];
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSug, setShowSug] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const getLastWord = (s: string) => {
    const m = s.match(/(\w+)$/);
    return m ? (m[1] ?? "").toUpperCase() : "";
  };

  const handleChange = (v: string) => {
    onChange(v);
    const last = getLastWord(v);
    if (last.length < 1) { setShowSug(false); return; }
    const hits = [
      ...columns.filter(c => c.toUpperCase().startsWith(last)),
      ...SQL_KEYWORDS.filter(k => k.startsWith(last)),
      ...OPERATORS.filter(o => o.startsWith(last)),
    ].slice(0, 10);
    setSuggestions(hits);
    setShowSug(hits.length > 0);
  };

  const pick = (s: string) => {
    const v = value.replace(/(\w+)$/, s) + " ";
    onChange(v);
    setShowSug(false);
    inputRef.current?.focus();
  };

  return (
    <div className="flex items-center gap-1 flex-1 relative">
      <Filter size={11} className="text-gray-400 flex-shrink-0" />
      <div className="relative flex-1">
        <input
          ref={inputRef}
          className="w-full text-xs px-2 py-0.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded outline-none focus:border-blue-500"
          value={value}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { setShowSug(false); onApply(); } if (e.key === "Escape") setShowSug(false); }}
          onBlur={() => setTimeout(() => setShowSug(false), 120)}
          placeholder="WHERE … (e.g. id > 10 AND name LIKE '%a%'  · Enter to apply)"
        />
        {showSug && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg z-20 max-h-40 overflow-y-auto">
            {suggestions.map(s => (
              <button
                key={s}
                onMouseDown={e => { e.preventDefault(); pick(s); }}
                className="w-full text-left px-3 py-1 text-xs font-mono text-gray-700 dark:text-gray-200 hover:bg-blue-500 hover:text-white"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onApply}
        className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
      >
        Apply
      </button>
    </div>
  );
}

function TBtn({
  icon, label, onClick, disabled, danger, active,
}: {
  icon: React.ReactNode; label?: string; onClick: () => void;
  disabled?: boolean; danger?: boolean; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        danger ? "text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
        : active ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
        : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
      }`}
    >
      {icon}
      {label && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}

export function DataEditor({
  profileId, database, tableName, pkCols, dbType,
  onExportCsv, onExportJson,
}: DataEditorProps) {
  const [cols, setCols] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [changes, setChanges] = useState<Map<number, Record<string, unknown>>>(new Map());
  const [pendingInserts, setPendingInserts] = useState<Record<string, unknown>[]>([]);
  const [deletedRows, setDeletedRows] = useState<Set<number>>(new Set());

  const [editCell, setEditCell] = useState<{ r: number; c: number; isNew: boolean; ni?: number } | null>(null);
  const [editVal, setEditVal] = useState("");
  const [filterWhere, setFilterWhere] = useState("");
  const [appliedWhere, setAppliedWhere] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const PAGE = 200;

  const editRef = useRef<HTMLInputElement>(null);

  const quoteId = (id: string) =>
    dbType === "postgres" ? `"${id.replace(/"/g, '""')}"` : `\`${id.replace(/`/g, "``")}\``;
  const fqn = `${quoteId(database)}.${quoteId(tableName)}`;

  const sqlVal = (v: unknown): string => {
    if (v === null || v === undefined || v === "") return "NULL";
    const s = String(v);
    if (/^-?\d+(\.\d+)?$/.test(s) && !s.includes("e")) return s;
    return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  };

  const fetchData = useCallback(async (offset = 0) => {
    setLoading(true);
    try {
      const where = appliedWhere ? ` WHERE ${appliedWhere}` : "";
      const result = await api.executeQuery(
        profileId,
        `SELECT * FROM ${fqn}${where} LIMIT ${PAGE} OFFSET ${offset}`,
      );
      setCols(result.columns);
      setRows(result.rows);
      setChanges(new Map());
      setPendingInserts([]);
      setDeletedRows(new Set());
      setSelectedRow(null);
    } catch (e) {
      alert(`Query error: ${(e as { message?: string }).message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, [profileId, fqn, appliedWhere]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (editCell) setTimeout(() => editRef.current?.focus(), 0); }, [editCell]);

  const cellVal = (r: number, c: number): unknown => {
    const colName = cols[c] as string | undefined;
    const ch = changes.get(r);
    if (ch && colName !== undefined && colName in ch) return ch[colName];
    return rows[r]?.[c];
  };

  const newRowVal = (ni: number, c: number): unknown => {
    const row = pendingInserts[ni]; const col = cols[c]; return (row && col) ? row[col] ?? null : null;
  };

  const startEdit = (r: number, c: number, isNew: boolean, ni?: number) => {
    const v = isNew ? newRowVal(ni!, c) : cellVal(r, c);
    setEditCell({ r, c, isNew, ni });
    setEditVal(v === null || v === undefined ? "" : String(v));
  };

  const confirmEdit = useCallback(() => {
    if (!editCell) return;
    const { r, c, isNew, ni } = editCell;
    const colName = cols[c] ?? "";
    const val = editVal === "" ? null : editVal;
    if (isNew && ni !== undefined) {
      setPendingInserts(prev => {
        const next = [...prev];
        next[ni] = { ...next[ni] as Record<string, unknown>, [colName]: val };
        return next;
      });
    } else {
      setChanges(prev => {
        const next = new Map(prev);
        next.set(r, { ...(next.get(r) ?? {}), [colName]: val });
        return next;
      });
    }
    setEditCell(null);
  }, [editCell, cols, editVal]);

  const addRow = () => {
    const empty: Record<string, unknown> = {};
    cols.forEach(c => empty[c] = null);
    setPendingInserts(prev => [...prev, empty]);
    setSelectedRow(rows.length + pendingInserts.length);
  };

  const deleteRow = () => {
    if (selectedRow === null) return;
    if (selectedRow < rows.length) {
      setDeletedRows(prev => new Set([...prev, selectedRow]));
    } else {
      const ni = selectedRow - rows.length;
      setPendingInserts(prev => prev.filter((_, i) => i !== ni));
    }
    setSelectedRow(null);
  };

  const duplicateRow = () => {
    if (selectedRow === null) return;
    const copy: Record<string, unknown> = {};
    cols.forEach((col, ci) => {
      copy[col] = selectedRow < rows.length ? cellVal(selectedRow, ci) : newRowVal(selectedRow - rows.length, ci);
    });
    // clear PK to avoid duplicate key
    pkCols.forEach(pk => { if (pk in copy) copy[pk] = null; });
    setPendingInserts(prev => [...prev, copy]);
  };

  const revert = () => {
    setChanges(new Map());
    setPendingInserts([]);
    setDeletedRows(new Set());
    setEditCell(null);
    setSelectedRow(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const stmts: string[] = [];

      // UPDATEs
      for (const [rowIdx, changed] of changes) {
        if (deletedRows.has(rowIdx)) continue;
        const setClauses = Object.entries(changed).map(([col, val]) => `${quoteId(col)} = ${sqlVal(val)}`);
        if (!setClauses.length) continue;
        const whereClause = buildPkWhere(rowIdx);
        if (!whereClause) { alert("Cannot UPDATE: no primary key detected"); continue; }
        stmts.push(`UPDATE ${fqn} SET ${setClauses.join(", ")} WHERE ${whereClause};`);
      }
      // DELETEs
      for (const rowIdx of deletedRows) {
        const whereClause = buildPkWhere(rowIdx);
        if (!whereClause) { alert("Cannot DELETE: no primary key detected"); continue; }
        stmts.push(`DELETE FROM ${fqn} WHERE ${whereClause};`);
      }
      // INSERTs
      for (const newRow of pendingInserts) {
        const validCols = Object.keys(newRow).filter(c => newRow[c] !== null);
        if (!validCols.length) continue;
        stmts.push(`INSERT INTO ${fqn} (${validCols.map(quoteId).join(", ")}) VALUES (${validCols.map(c => sqlVal(newRow[c])).join(", ")});`);
      }

      for (const sql of stmts) {
        await api.executeQuery(profileId, sql);
      }
      await fetchData();
    } catch (e) {
      alert(`Save failed: ${(e as { message?: string }).message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const buildPkWhere = (rowIdx: number) => {
    const keyList = pkCols.length ? pkCols : cols.slice(0, 1);
    if (!keyList.length) return null;
    return keyList
      .map(pk => { const ci = cols.indexOf(pk); return `${quoteId(pk)} = ${sqlVal(rows[rowIdx]?.[ci])}`; })
      .join(" AND ");
  };

  const hasPending = changes.size > 0 || pendingInserts.length > 0 || deletedRows.size > 0;
  const totalVisible = rows.length + pendingInserts.length - deletedRows.size;

  const colNames = useMemo(() => cols, [cols]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#1e1e1e]">
      {/* Grid area */}
      <div className="flex-1 overflow-auto relative">
        {loading ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-500">
            Loading...
          </div>
        ) : (
          <table className="w-full border-collapse text-xs" style={{ minWidth: "max-content" }}>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="w-10 min-w-[40px] bg-gray-100 dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-700 px-1 text-center text-gray-400 dark:text-gray-500 select-none font-normal">#</th>
                {cols.map(col => (
                  <th key={col} className="bg-gray-100 dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-700 px-3 py-1.5 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap select-none">
                    {col}
                    {pkCols.includes(col) && <span className="ml-1 text-[9px] text-amber-500 font-bold">PK</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((_, rowIdx) => {
                const isDeleted = deletedRows.has(rowIdx);
                const isModified = changes.has(rowIdx);
                const isSelected = selectedRow === rowIdx;
                return (
                  <tr
                    key={rowIdx}
                    onClick={() => setSelectedRow(rowIdx)}
                    className={`cursor-pointer border-b border-gray-100 dark:border-gray-800 transition-colors ${
                      isDeleted ? "opacity-30 line-through" :
                      isSelected ? "bg-blue-50 dark:bg-blue-900/30" :
                      isModified ? "bg-yellow-50 dark:bg-yellow-900/10" :
                      "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    }`}
                  >
                    <td className="border-r border-gray-100 dark:border-gray-800 px-1 text-center text-gray-400 dark:text-gray-600 tabular-nums select-none">
                      {rowIdx + 1}
                    </td>
                    {cols.map((col, colIdx) => {
                      const isEditing = editCell?.r === rowIdx && editCell?.c === colIdx && !editCell.isNew;
                      const val = cellVal(rowIdx, colIdx);
                      const cellModified = isModified && changes.get(rowIdx)![col] !== undefined;
                      return (
                        <td
                          key={col}
                          className={`border-r border-gray-100 dark:border-gray-800 max-w-[220px] ${cellModified ? "bg-yellow-100 dark:bg-yellow-900/20" : ""}`}
                          onDoubleClick={() => !isDeleted && startEdit(rowIdx, colIdx, false)}
                        >
                          {isEditing ? (
                            <input
                              ref={editRef}
                              className="w-full px-2 py-1 text-xs outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 border border-blue-400 rounded"
                              value={editVal}
                              onChange={e => setEditVal(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") confirmEdit();
                                if (e.key === "Escape") setEditCell(null);
                                if (e.key === "Tab") { e.preventDefault(); confirmEdit(); }
                              }}
                              onBlur={confirmEdit}
                            />
                          ) : (
                            <div className="px-2 py-1 truncate text-gray-800 dark:text-gray-200">
                              {val === null || val === undefined
                                ? <span className="italic text-gray-400 dark:text-gray-500">NULL</span>
                                : String(val)}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {/* Pending insert rows */}
              {pendingInserts.map((newRow, ni) => {
                const absIdx = rows.length + ni;
                const isSelected = selectedRow === absIdx;
                return (
                  <tr
                    key={`new-${ni}`}
                    onClick={() => setSelectedRow(absIdx)}
                    className={`cursor-pointer border-b border-gray-100 dark:border-gray-800 ${
                      isSelected ? "bg-blue-50 dark:bg-blue-900/30" : "bg-green-50 dark:bg-green-900/10"
                    }`}
                  >
                    <td className="border-r border-gray-100 dark:border-gray-800 px-1 text-center text-green-500 text-[10px] select-none">+</td>
                    {cols.map((col, colIdx) => {
                      const isEditing = editCell?.r === ni && editCell?.c === colIdx && editCell?.isNew;
                      const val = newRow[col];
                      return (
                        <td
                          key={col}
                          className="border-r border-gray-100 dark:border-gray-800 max-w-[220px]"
                          onDoubleClick={() => startEdit(ni, colIdx, true, ni)}
                        >
                          {isEditing ? (
                            <input
                              ref={editRef}
                              className="w-full px-2 py-1 text-xs outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 border border-green-400 rounded"
                              value={editVal}
                              onChange={e => setEditVal(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") confirmEdit();
                                if (e.key === "Escape") setEditCell(null);
                                if (e.key === "Tab") { e.preventDefault(); confirmEdit(); }
                              }}
                              onBlur={confirmEdit}
                            />
                          ) : (
                            <div className="px-2 py-1 truncate text-green-700 dark:text-green-300">
                              {val === null || val === undefined
                                ? <span className="italic text-gray-400 dark:text-gray-500">NULL</span>
                                : String(val)}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Bottom toolbar */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#252526] px-2 py-1 flex items-center gap-1 flex-wrap">
        {/* Row ops */}
        <TBtn icon={<Plus size={12} />} label="Add" onClick={addRow} />
        <TBtn icon={<Trash2 size={12} />} label="Delete" onClick={deleteRow} danger disabled={selectedRow === null} />
        <TBtn icon={<Copy size={12} />} label="Duplicate" onClick={duplicateRow} disabled={selectedRow === null} />
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1 flex-shrink-0" />

        {/* Filter / WHERE bar */}
        <FilterBar
          value={filterWhere}
          onChange={setFilterWhere}
          onApply={() => setAppliedWhere(filterWhere)}
          columns={colNames}
        />
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1 flex-shrink-0" />

        {/* Pagination */}
        <TBtn icon={<ChevronFirst size={12} />} onClick={() => setPage(0)} disabled={page === 0} />
        <TBtn icon={<ChevronLeft size={12} />} onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} />
        <span className="text-xs text-gray-500 dark:text-gray-400 px-1 whitespace-nowrap">
          {totalVisible} rows
        </span>
        <TBtn icon={<ChevronRight size={12} />} onClick={() => setPage(p => p + 1)} disabled={rows.length < PAGE} />
        <TBtn icon={<ChevronLast size={12} />} onClick={() => setPage(p => p + 1)} disabled={rows.length < PAGE} />
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1 flex-shrink-0" />

        {/* Export */}
        {onExportCsv && (
          <TBtn icon={<Download size={12} />} label="CSV" onClick={() => onExportCsv(cols, rows)} />
        )}
        {onExportJson && (
          <TBtn icon={<Download size={12} />} label="JSON" onClick={() => onExportJson(cols, rows)} />
        )}
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1 flex-shrink-0" />

        {/* Save/revert/refresh */}
        <TBtn
          icon={<Save size={12} />}
          label={saving ? "Saving…" : "Save"}
          onClick={save}
          disabled={!hasPending || saving}
          active={hasPending}
        />
        <TBtn icon={<RotateCcw size={12} />} label="Revert" onClick={revert} disabled={!hasPending} />
        <TBtn icon={<RefreshCw size={12} />} label="Refresh" onClick={() => fetchData(page * PAGE)} />
      </div>
    </div>
  );
}
