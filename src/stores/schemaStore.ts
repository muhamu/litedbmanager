import { create } from "zustand";
import type {
  SchemaItem,
  ColumnInfo,
  IndexInfo,
  ForeignKeyInfo,
  QueryResult,
} from "../lib/tauri";
import * as api from "../lib/tauri";

export interface SelectedObject {
  database: string;
  name: string;
  type: "table" | "view" | "procedure" | "function" | "trigger" | "sequence";
}

interface SchemaState {
  databases: string[];
  selectedDb: string | null;

  // Cached per database
  schemaItems: Record<string, SchemaItem[]>;
  expandedDbs: Record<string, boolean>;

  // Cached per table (key: "db.table")
  tableColumns: Record<string, ColumnInfo[]>;
  tableIndexes: Record<string, IndexInfo[]>;
  tableForeignKeys: Record<string, ForeignKeyInfo[]>;
  expandedTables: Record<string, boolean>;

  // Object detail viewer
  selectedObject: SelectedObject | null;
  objectData: QueryResult | null;
  objectCreateStmt: string | null;
  objectRowCount: number | null;
  objectLoading: boolean;
  objectLoadingMore: boolean;
  objectHasMore: boolean;
  objectViewTab: "data" | "columns" | "ddl";

  // Loading flags
  loading: Record<string, boolean>;

  // Error per key
  errors: Record<string, string>;

  // Active context menu
  contextMenu: {
    x: number;
    y: number;
    type: string;
    database: string;
    object: string;
  } | null;

  // Actions
  loadDatabases: (profileId: string) => Promise<void>;
  toggleDatabase: (profileId: string, db: string) => Promise<void>;
  toggleTable: (profileId: string, db: string, table: string) => Promise<void>;
  reloadTable: (profileId: string, db: string, table: string) => Promise<void>;
  reloadDatabase: (profileId: string, db: string) => Promise<void>;
  closeContextMenu: () => void;
  clearSchema: () => void;
  setContextMenu: (menu: SchemaState["contextMenu"]) => void;
  selectObject: (profileId: string, obj: SelectedObject) => Promise<void>;
  loadMoreObjectData: (profileId: string) => Promise<void>;
  setObjectViewTab: (tab: "data" | "columns" | "ddl") => void;
  closeObjectViewer: () => void;
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  databases: [],
  selectedDb: null,
  schemaItems: {},
  expandedDbs: {},
  tableColumns: {},
  tableIndexes: {},
  tableForeignKeys: {},
  expandedTables: {},
  loading: {},
  errors: {},
  contextMenu: null,

  // Object viewer state
  selectedObject: null,
  objectData: null,
  objectCreateStmt: null,
  objectRowCount: null,
  objectLoading: false,
  objectLoadingMore: false,
  objectHasMore: false,
  objectViewTab: "data",

  clearSchema: () =>
    set({
      databases: [],
      selectedDb: null,
      schemaItems: {},
      expandedDbs: {},
      tableColumns: {},
      tableIndexes: {},
      tableForeignKeys: {},
      expandedTables: {},
      loading: {},
      errors: {},
      selectedObject: null,
      objectData: null,
      objectCreateStmt: null,
      objectRowCount: null,
      objectHasMore: false,
    }),

  loadDatabases: async (profileId: string) => {
    set((s) => ({
      loading: { ...s.loading, databases: true },
      errors: { ...s.errors, databases: "" },
    }));
    try {
      const databases = await api.listDatabases(profileId);
      set((s) => ({ databases, loading: { ...s.loading, databases: false } }));
    } catch (e) {
      const msg = (e as { message?: string }).message ?? "Failed";
      set((s) => ({
        loading: { ...s.loading, databases: false },
        errors: { ...s.errors, databases: msg },
      }));
    }
  },

  toggleDatabase: async (profileId: string, db: string) => {
    const s = get();
    if (s.expandedDbs[db]) {
      const newExpanded = { ...s.expandedDbs };
      delete newExpanded[db];
      set({ expandedDbs: newExpanded, selectedDb: db });
      return;
    }
    if (s.schemaItems[db]) {
      set({ expandedDbs: { ...s.expandedDbs, [db]: true }, selectedDb: db });
      return;
    }
    const loadKey = `db:${db}`;
    set((st) => ({
      loading: { ...st.loading, [loadKey]: true },
      errors: { ...st.errors, [loadKey]: "" },
      selectedDb: db,
    }));
    try {
      const items = await api.listTables(profileId, db);
      set((st) => ({
        schemaItems: { ...st.schemaItems, [db]: items },
        expandedDbs: { ...st.expandedDbs, [db]: true },
        loading: { ...st.loading, [loadKey]: false },
      }));
    } catch (e) {
      const msg = (e as { message?: string }).message ?? "Failed";
      set((st) => ({
        loading: { ...st.loading, [loadKey]: false },
        errors: { ...st.errors, [loadKey]: msg },
      }));
    }
  },

  toggleTable: async (profileId: string, db: string, table: string) => {
    const s = get();
    const tblKey = `${db}.${table}`;
    if (s.expandedTables[tblKey]) {
      const newExpanded = { ...s.expandedTables };
      delete newExpanded[tblKey];
      set({ expandedTables: newExpanded });
      return;
    }
    if (s.tableColumns[tblKey]) {
      set((st) => ({ expandedTables: { ...st.expandedTables, [tblKey]: true } }));
      return;
    }
    const loadKey = `tbl:${tblKey}`;
    set((st) => ({
      loading: { ...st.loading, [loadKey]: true },
      errors: { ...st.errors, [loadKey]: "" },
    }));
    try {
      // Columns first — show the field list immediately (fast SHOW FULL COLUMNS).
      const columns = await api.listColumns(profileId, db, table);
      set((st) => ({
        tableColumns: { ...st.tableColumns, [tblKey]: columns },
        expandedTables: { ...st.expandedTables, [tblKey]: true },
        loading: { ...st.loading, [loadKey]: false },
      }));
    } catch (e) {
      const msg = (e as { message?: string }).message ?? "Failed";
      set((st) => ({
        loading: { ...st.loading, [loadKey]: false },
        errors: { ...st.errors, [loadKey]: msg },
      }));
      return;
    }
    // Indexes + FKs in the background — they must not block the field list.
    Promise.allSettled([
      api.listIndexes(profileId, db, table),
      api.listForeignKeys(profileId, db, table),
    ]).then(([idx, fk]) => {
      set((st) => ({
        tableIndexes: idx.status === "fulfilled" ? { ...st.tableIndexes, [tblKey]: idx.value } : st.tableIndexes,
        tableForeignKeys: fk.status === "fulfilled" ? { ...st.tableForeignKeys, [tblKey]: fk.value } : st.tableForeignKeys,
      }));
    });
  },

  reloadTable: async (profileId: string, db: string, table: string) => {
    const tblKey = `${db}.${table}`;
    try {
      const [columns, indexes, foreignKeys] = await Promise.all([
        api.listColumns(profileId, db, table),
        api.listIndexes(profileId, db, table),
        api.listForeignKeys(profileId, db, table),
      ]);
      set((st) => ({
        tableColumns: { ...st.tableColumns, [tblKey]: columns },
        tableIndexes: { ...st.tableIndexes, [tblKey]: indexes },
        tableForeignKeys: { ...st.tableForeignKeys, [tblKey]: foreignKeys },
      }));
    } catch { /* ignore — refresh is best-effort */ }
  },

  reloadDatabase: async (profileId: string, db: string) => {
    try {
      const items = await api.listTables(profileId, db);
      set((st) => ({ schemaItems: { ...st.schemaItems, [db]: items } }));
    } catch { /* ignore */ }
  },

  closeContextMenu: () => set({ contextMenu: null }),

  setContextMenu: (menu) => set({ contextMenu: menu }),

  selectObject: async (_profileId: string, obj: SelectedObject) => {
    set({ selectedObject: obj, selectedDb: obj.database });
  },

  loadMoreObjectData: async (profileId: string) => {
    const { selectedObject, objectData } = get();
    if (!selectedObject || !objectData) return;
    const PAGE = 200;
    set({ objectLoadingMore: true });
    try {
      const more = await api.showTableData(
        profileId, selectedObject.database, selectedObject.name,
        PAGE, objectData.rows.length
      );
      set((st) => ({
        objectData: st.objectData ? {
          ...st.objectData,
          rows: [...st.objectData.rows, ...more.rows],
        } : more,
        objectHasMore: more.rows.length >= PAGE,
        objectLoadingMore: false,
      }));
    } catch {
      set({ objectLoadingMore: false });
    }
  },

  setObjectViewTab: (tab) => set({ objectViewTab: tab }),

  closeObjectViewer: () =>
    set({
      selectedObject: null,
      objectData: null,
      objectCreateStmt: null,
      objectRowCount: null,
    }),
}));
