import { create } from "zustand";
import { syncEngine } from "@/offline/sync-engine";
import type { SyncStatus } from "@/offline/sync-engine";

interface OfflineState {
  isOnline: boolean;
  pendingCount: number;
  syncStatus: SyncStatus;
  setOnline: (online: boolean) => void;
  refresh: () => void;
}

export const useOfflineStore = create<OfflineState>((set) => {
  const updatePendingCount = async () => {
    const count = await syncEngine.getPendingCount();
    set({ pendingCount: count });
  };

  if (typeof window !== "undefined") {
    syncEngine.onChange((status) => {
      set({ syncStatus: status });
      updatePendingCount();
    });

    updatePendingCount();
  }

  return {
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    pendingCount: 0,
    syncStatus: "idle",
    setOnline: (online: boolean) => {
      set({ isOnline: online });
    },
    refresh: () => {
      syncEngine.processQueue();
    },
  };
});
