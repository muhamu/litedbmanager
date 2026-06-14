import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import type { QueryResult } from "../../lib/tauri";
import { useThemeStore } from "../../stores/themeStore";

interface ResultGridProps {
  result: QueryResult | null;
  error: string | null;
  running: boolean;
}

function CellInspector({
  value,
  onClose,
}: {
  value: string;
  onClose: () => void;
}) {
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 max-h-[200px] overflow-auto">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
          Cell Value
        </span>
        <button
          onClick={onClose}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          Close
        </button>
      </div>
      <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-[140px] overflow-y-auto">
        {value}
      </pre>
    </div>
  );
}

export function ResultGrid({ result, error, running }: ResultGridProps) {
  const { theme } = useThemeStore();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [inspectedCell, setInspectedCell] = useState<{
    row: unknown[];
    colIdx: number;
    value: string;
  } | null>(null);

  const data = useMemo(() => {
    if (!result || result.columns.length === 0 || result.rows.length === 0)
      return [];
    return result.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      result.columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }, [result]);

  const columns = useMemo(() => {
    if (!result || result.columns.length === 0) return [];
    const helper = createColumnHelper<Record<string, unknown>>();
    return result.columns.map((col) =>
      helper.accessor(col, {
        id: col,
        header: () => (
          <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">
            {col}
          </span>
        ),
        cell: (info) => {
          const val = info.getValue();
          const display =
            val === null
              ? "NULL"
              : typeof val === "object"
                ? JSON.stringify(val)
                : String(val);
          return (
            <span
              className={`font-mono text-xs truncate block max-w-[300px] ${
                val === null
                  ? "text-gray-400 italic"
                  : typeof val === "number"
                    ? "text-blue-600 dark:text-blue-400 text-right"
                    : "text-gray-800 dark:text-gray-200"
              }`}
              onDoubleClick={() =>
                setInspectedCell({
                  row: result!.rows[info.row.index] ?? [],
                  colIdx: info.column.getIndex(),
                  value: display,
                })
              }
              title="Double-click to inspect"
            >
              {display}
            </span>
          );
        },
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, theme]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSorting: true,
  });

  // States
  if (running) {
    return (
      <div className="flex items-center justify-center h-full py-12">
        <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          Running query...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">
            Query Error
          </p>
          <pre className="mt-1 text-xs text-red-700 dark:text-red-400 font-mono whitespace-pre-wrap">
            {error}
          </pre>
        </div>
      </div>
    );
  }

  if (!result) return null;

  if (result.columns.length === 0 && result.rows_affected > 0) {
    return (
      <div className="p-4 text-sm text-gray-600 dark:text-gray-400">
        Query executed successfully. {result.rows_affected} row(s) affected in{" "}
        {result.execution_time_ms}ms.
      </div>
    );
  }

  if (result.rows.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
        No rows returned ({result.execution_time_ms}ms)
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                <th className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-800 border-r border-b border-gray-200 dark:border-gray-700 px-1 py-0 text-xs text-gray-500 dark:text-gray-400 font-medium w-8 text-center">
                  #
                </th>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-800 border-r border-b border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-left cursor-pointer select-none hover:bg-gray-200 dark:hover:bg-gray-700 whitespace-nowrap"
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ minWidth: 80 }}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {{
                        asc: " 🔼",
                        desc: " 🔽",
                      }[header.column.getIsSorted() as string] ?? null}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, rowIdx) => (
              <tr
                key={row.id}
                className="hover:bg-blue-50/50 dark:hover:bg-blue-900/20 border-b border-gray-100 dark:border-gray-800"
              >
                <td className="border-r border-gray-100 dark:border-gray-800 px-1 py-0.5 text-xs text-gray-400 text-center select-none">
                  {rowIdx + 1}
                </td>
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="border-r border-gray-100 dark:border-gray-800 px-2 py-0.5 whitespace-nowrap"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Status bar */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-4">
        <span>
          <strong>{data.length}</strong> row{data.length !== 1 ? "s" : ""}
        </span>
        <span>
          <strong>{result.columns.length}</strong> col
          {result.columns.length !== 1 ? "s" : ""}
        </span>
        <span>
          <strong>{result.execution_time_ms}</strong> ms
        </span>
      </div>

      {/* Cell inspector */}
      {inspectedCell && (
        <CellInspector
          value={inspectedCell.value}
          onClose={() => setInspectedCell(null)}
        />
      )}
    </div>
  );
}
