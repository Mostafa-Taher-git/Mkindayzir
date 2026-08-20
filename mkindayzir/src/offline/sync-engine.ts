import { db } from "./db";
import type { QueuedMutation } from "./db";

export type SyncStatus = "idle" | "syncing" | "error" | "complete";

type Listener = (status: SyncStatus) => void;

export class SyncEngine {
  private static instance: SyncEngine | null = null;
  private isOnline = true;
  private status: SyncStatus = "idle";
  private listeners = new Set<Listener>();
  private processing = false;

  static getInstance(): SyncEngine {
    if (!SyncEngine.instance) {
      SyncEngine.instance = new SyncEngine();
    }
    return SyncEngine.instance;
  }

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.handleOnline());
      window.addEventListener("offline", () => this.handleOffline());
      this.isOnline = navigator.onLine;
    }
  }

  private setStatus(status: SyncStatus) {
    this.status = status;
    this.listeners.forEach((listener) => listener(status));
  }

  private handleOnline() {
    this.isOnline = true;
    this.processQueue();
  }

  private handleOffline() {
    this.isOnline = false;
  }

  getOnlineState(): boolean {
    return this.isOnline;
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async enqueue(mutation: Omit<QueuedMutation, "id" | "timestamp" | "retryCount" | "status">): Promise<void> {
    await db.mutations.add({
      ...mutation,
      timestamp: Date.now(),
      retryCount: 0,
      status: "pending",
    });

    if (this.isOnline && !this.processing) {
      this.processQueue();
    }
  }

  async getPendingCount(): Promise<number> {
    return db.mutations
      .where("status")
      .anyOf(["pending", "syncing"])
      .count();
  }

  async processQueue(): Promise<void> {
    if (this.processing || !this.isOnline) {
      return;
    }

    this.processing = true;
    this.setStatus("syncing");

    try {
      const pending = await db.mutations
        .where("status")
        .anyOf(["pending", "failed"])
        .filter((m) => m.retryCount < 5)
        .sortBy("timestamp");

      for (const mutation of pending) {
        await this.processMutation(mutation);
      }
    } finally {
      this.processing = false;
      const remaining = await db.mutations
        .where("status")
        .anyOf(["pending", "syncing"])
        .count();
      this.setStatus(remaining > 0 ? "idle" : "complete");
    }
  }

  private async processMutation(mutation: QueuedMutation): Promise<void> {
    await db.mutations.update(mutation.id!, { status: "syncing" });

    try {
      const response = await fetch(mutation.url, {
        method: mutation.method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mutation.body),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await db.mutations.update(mutation.id!, {
        status: "completed",
      });
    } catch (error) {
      const retryCount = mutation.retryCount + 1;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (retryCount >= 5) {
        await db.mutations.update(mutation.id!, {
          status: "failed",
          retryCount,
          error: errorMessage,
        });
      } else {
        await db.mutations.update(mutation.id!, {
          status: "pending",
          retryCount,
          error: errorMessage,
        });
      }
    }
  }
}

export const syncEngine = SyncEngine.getInstance();
