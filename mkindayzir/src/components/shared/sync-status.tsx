"use client";

import { useOfflineStore } from "@/stores/offline.store";

export function SyncStatus() {
  const isOnline = useOfflineStore((s) => s.isOnline);
  const pendingCount = useOfflineStore((s) => s.pendingCount);
  const syncStatus = useOfflineStore((s) => s.syncStatus);

  if (isOnline && pendingCount === 0 && syncStatus === "idle") {
    return null;
  }

  return (
    <div className="flex items-center gap-1 text-xs">
      {syncStatus === "syncing" && (
        <svg
          className="h-4 w-4 animate-spin text-blue-500"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {pendingCount > 0 && (
        <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
          {pendingCount} pending
        </span>
      )}
    </div>
  );
}
