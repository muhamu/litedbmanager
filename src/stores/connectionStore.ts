import { create } from "zustand";
import type { ConnectionProfile, ProfileInput } from "../lib/tauri";
import * as api from "../lib/tauri";

interface ConnectionState {
  profiles: ConnectionProfile[];
  connectedId: string | null;
  serverVersion: string | null;
  loading: boolean;
  error: string | null;

  loadProfiles: () => Promise<void>;
  addProfile: (input: ProfileInput) => Promise<ConnectionProfile>;
  removeProfile: (id: string) => Promise<void>;
  testConnection: (input: ProfileInput) => Promise<string>;
  connect: (id: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  profiles: [],
  connectedId: null,
  serverVersion: null,
  loading: false,
  error: null,

  loadProfiles: async () => {
    set({ loading: true, error: null });
    try {
      const profiles = await api.listProfiles();
      set({ profiles, loading: false });
    } catch (e) {
      const err = e as { message?: string };
      set({ error: err.message ?? "Failed to load profiles", loading: false });
    }
  },

  addProfile: async (input: ProfileInput) => {
    const profile = await api.saveProfile(input);
    set((state) => ({ profiles: [...state.profiles, profile] }));
    return profile;
  },

  removeProfile: async (id: string) => {
    await api.deleteProfile(id);
    set((state) => ({
      profiles: state.profiles.filter((p) => p.id !== id),
      connectedId: state.connectedId === id ? null : state.connectedId,
      serverVersion: state.connectedId === id ? null : state.serverVersion,
    }));
  },

  testConnection: async (input: ProfileInput) => {
    return api.testConnection(
      input.host,
      input.port,
      input.user,
      input.password,
      input.database,
      input.ssl,
      input.db_type,
    );
  },

  connect: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const version = await api.connectToProfile(id);
      set({ connectedId: id, serverVersion: version, loading: false });
    } catch (e) {
      const err = e as { message?: string };
      set({ error: err.message ?? "Failed to connect", loading: false });
    }
  },

  disconnect: async (id: string) => {
    await api.disconnectProfile(id);
    set({ connectedId: null, serverVersion: null });
  },
}));
