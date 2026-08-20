import Dexie, { type Table } from "dexie";

export type MutationMethod = "POST" | "PUT" | "PATCH" | "DELETE";
export type MutationStatus = "pending" | "syncing" | "failed" | "completed";

export interface QueuedMutation {
  id?: number;
  mutationId: string;
  timestamp: number;
  method: MutationMethod;
  url: string;
  body: unknown;
  retryCount: number;
  status: MutationStatus;
  error?: string;
}

export interface CachedEntity {
  id?: number;
  entityType: string;
  entityId: string;
  data: unknown;
  cachedAt: number;
  expiresAt?: number;
}

export interface OfflineSettings {
  id?: number;
  key: string;
  value: unknown;
}

export class OfflineDB extends Dexie {
  mutations!: Table<QueuedMutation, number>;
  cache!: Table<CachedEntity, number>;
  settings!: Table<OfflineSettings, number>;

  constructor() {
    super("mkindayzir-offline");

    this.version(1).stores({
      mutations: "++id, mutationId, timestamp, status, method",
      cache: "++id, entityType, entityId, cachedAt",
      settings: "++id, key",
    });
  }
}

export const db = new OfflineDB();
