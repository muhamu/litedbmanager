import { create } from "zustand";
import type { QueryResult } from "../lib/tauri";
import * as api from "../lib/tauri";
import { v4 as uuid } from "../lib/id";

export interface QueryTab {
  id: string;
  name: string;
  sql: string;
  result: QueryResult | null;
  error: string | null;
  running: boolean;
  modified: boolean;
}

interface QueryState {
  tabs: QueryTab[];
  activeTabId: string | null;
  savedQueries: { name: string; sql: string }[];

  newTab: (sql?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateSql: (id: string, sql: string) => void;
  setResult: (id: string, result: QueryResult | null) => void;
  setError: (id: string, error: string | null) => void;
  setRunning: (id: string, running: boolean) => void;
  renameTab: (id: string, name: string) => void;
  executeQuery: (profileId: string, sqlOverride?: string) => Promise<void>;
  executeAll: (profileId: string, sqlOverride?: string) => Promise<void>;
  saveCurrentQuery: (name: string) => void;
  loadQuery: (sql: string) => void;
}

let _counter = 0;
function nextName() {
  _counter++;
  return `Query ${_counter}`;
}

export const useQueryStore = create<QueryState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  savedQueries: [],

  newTab: (sql) => {
    const id = uuid();
    const tab: QueryTab = {
      id,
      name: nextName(),
      sql: sql ?? "",
      result: null,
      error: null,
      running: false,
      modified: false,
    };
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: id,
    }));
  },

  closeTab: (id) => {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      const newTabs = s.tabs.filter((t) => t.id !== id);
      let newActive = s.activeTabId;
      if (s.activeTabId === id) {
        if (newTabs.length === 0) {
          newActive = null;
        } else if (idx > 0) {
          newActive = newTabs[idx - 1]!.id;
        } else {
          newActive = newTabs[0]?.id ?? null;
        }
      }
      return { tabs: newTabs, activeTabId: newActive };
    });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateSql: (id, sql) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, sql, modified: true } : t)),
    })),

  setResult: (id, result) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, result, error: null, running: false } : t)),
    })),

  setError: (id, error) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, error, result: null, running: false } : t)),
    })),

  setRunning: (id, running) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, running } : t)),
    })),

  renameTab: (id, name) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, name, modified: false } : t)),
    })),

  executeQuery: async (profileId, sqlOverride) => {
    const { activeTabId } = get();
    if (!activeTabId) return;
    const tab = get().tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    const sql = (sqlOverride ?? tab.sql).trim();
    if (!sql) return;

    get().setRunning(activeTabId, true);
    try {
      const result = await api.executeQuery(profileId, sql);
      get().setResult(activeTabId, result);
    } catch (e) {
      const msg = (e as { message?: string }).message ?? "Query failed";
      get().setError(activeTabId, msg);
    }
  },

  executeAll: async (profileId, sqlOverride) => {
    await get().executeQuery(profileId, sqlOverride);
  },

  saveCurrentQuery: (name) => {
    const { activeTabId } = get();
    if (!activeTabId) return;
    const tab = get().tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    const q = { name, sql: tab.sql };
    set((s) => {
      const existing = s.savedQueries.findIndex((q) => q.name === name);
      const list =
        existing >= 0
          ? s.savedQueries.map((q, i) => (i === existing ? { ...q, sql: tab.sql } : q))
          : [...s.savedQueries, q];
      return { savedQueries: list };
    });
  },

  loadQuery: (sql) => {
    get().newTab(sql);
  },
}));
