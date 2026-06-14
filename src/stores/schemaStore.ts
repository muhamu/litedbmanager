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
  objectViewTab: "data" | "ddl";

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
  closeContextMenu: () => void;
  clearSchema: () => void;
  setContextMenu: (menu: SchemaState["contextMenu"]) => void;
  selectObject: (profileId: string, obj: SelectedObject) => Promise<void>;
  setObjectViewTab: (tab: "data" | "ddl") => void;
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
      const [columns, indexes, foreignKeys] = await Promise.all([
        api.listColumns(profileId, db, table),
        api.listIndexes(profileId, db, table),
        api.listForeignKeys(profileId, db, table),
      ]);
      set((st) => ({
        tableColumns: { ...st.tableColumns, [tblKey]: columns },
        tableIndexes: { ...st.tableIndexes, [tblKey]: indexes },
        tableForeignKeys: { ...st.tableForeignKeys, [tblKey]: foreignKeys },
        expandedTables: { ...st.expandedTables, [tblKey]: true },
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

  closeContextMenu: () => set({ contextMenu: null }),

  setContextMenu: (menu) => set({ contextMenu: menu }),

  selectObject: async (profileId: string, obj: SelectedObject) => {
    set({
      selectedObject: obj,
      objectLoading: true,
      objectData: null,
      objectCreateStmt: null,
      objectRowCount: null,
    });

    try {
      // Load CREATE statement for all object types
      const createStmt = await api.getCreateStatement(
        profileId,
        obj.database,
        obj.name,
        obj.type,
      );

      // For tables and views, also load data
      let data: QueryResult | null = null;
      let rowCount: number | null = null;

      if (obj.type === "table" || obj.type === "view") {
        try {
          const [tableData, count] = await Promise.all([
            api.showTableData(profileId, obj.database, obj.name, 1000, 0),
            obj.type === "table"
              ? api.countTableRows(profileId, obj.database, obj.name)
              : Promise.resolve(null),
          ]);
          data = tableData;
          rowCount = count;
        } catch {
          // If SELECT fails, still show CREATE
        }
      }

      set({
        objectData: data,
        objectCreateStmt: createStmt,
        objectRowCount: rowCount,
        objectLoading: false,
        objectViewTab: "data",
      });
    } catch (e) {
      const msg = (e as { message?: string }).message ?? "Failed";
      set({
        objectLoading: false,
        objectCreateStmt: `-- Error loading ${obj.type} ${obj.name}:\n-- ${msg}`,
      });
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
