import { useEffect, useRef } from "react";
import { useConnectionStore } from "../../stores/connectionStore";
import * as api from "../../lib/tauri";
import { useSchemaStore } from "../../stores/schemaStore";

export function ContextMenu() {
  const { contextMenu, closeContextMenu } = useSchemaStore();
  const { connectedId } = useConnectionStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;

    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeContextMenu();
    };

    // Delay adding listener so the right-click event doesn't immediately close it
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

  const menuItems: {
    label: string;
    action: () => void;
    danger?: boolean;
    disabled?: boolean;
  }[] = [];

  if (type === "table" || type === "view") {
    menuItems.push({
      label: "Open Data (LIMIT 1000)",
      action: () => {
        // Will be handled by parent component via callback
        window.dispatchEvent(
          new CustomEvent("litedb:open-table", {
            detail: { database, table: object },
          }),
        );
        closeContextMenu();
      },
    });
    menuItems.push({
      label: "Show CREATE",
      action: async () => {
        try {
          const stmt = await api.getCreateStatement(
            connectedId,
            database,
            object,
            type,
          );
          window.dispatchEvent(
            new CustomEvent("litedb:show-create", {
              detail: { stmt, object, type },
            }),
          );
        } catch (e) {
          console.error(e);
        }
        closeContextMenu();
      },
    });
    menuItems.push({
      label: "Copy Name",
      action: () => {
        navigator.clipboard.writeText(object).catch(() => {});
        closeContextMenu();
      },
    });
    menuItems.push({
      label: "Copy qualified name",
      action: () => {
        navigator.clipboard.writeText(`\`${database}\`.\`${object}\``).catch(() => {});
        closeContextMenu();
      },
    });
    if (type === "table") {
      menuItems.push({ label: "---", action: () => {}, disabled: true });
      menuItems.push({
        label: "Truncate",
        action: async () => {
          if (confirm(`Truncate TABLE \`${database}\`.\`${object}\`?\n\nThis cannot be undone!`)) {
            try {
              await api.truncateTable(connectedId, database, object);
            } catch (e) {
              alert(`Error: ${(e as { message?: string }).message ?? "Unknown"}`);
            }
          }
          closeContextMenu();
        },
        danger: true,
      });
      menuItems.push({
        label: "Drop",
        action: async () => {
          if (confirm(`DROP TABLE \`${database}\`.\`${object}\`?\n\nThis cannot be undone!`)) {
            try {
              await api.dropObject(connectedId, database, object, "table");
            } catch (e) {
              alert(`Error: ${(e as { message?: string }).message ?? "Unknown"}`);
            }
          }
          closeContextMenu();
        },
        danger: true,
      });
    }
  } else {
    menuItems.push({
      label: "Show CREATE",
      action: async () => {
        try {
          const stmt = await api.getCreateStatement(
            connectedId,
            database,
            object,
            type,
          );
          window.dispatchEvent(
            new CustomEvent("litedb:show-create", {
              detail: { stmt, object, type },
            }),
          );
        } catch (e) {
          console.error(e);
        }
        closeContextMenu();
      },
    });
    menuItems.push({
      label: "Copy Name",
      action: () => {
        navigator.clipboard.writeText(object).catch(() => {});
        closeContextMenu();
      },
    });
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      {menuItems.map((item, i) =>
        item.disabled ? (
          <div key={i} className="mx-2 my-1 border-t border-gray-200" />
        ) : (
          <button
            key={i}
            className={`flex w-full items-center px-3 py-1.5 text-left text-sm transition-colors ${
              item.danger
                ? "text-red-600 hover:bg-red-50"
                : "text-gray-700 hover:bg-gray-100"
            }`}
            onClick={item.action}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
