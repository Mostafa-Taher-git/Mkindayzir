import { useEffect, useState } from "react";
import { syncEngine } from "@/offline/sync-engine";

export function useSync() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const unsubscribe = syncEngine.onChange((status) => {
      setIsSyncing(status === "syncing");
    });

    const updateCount = async () => {
      const count = await syncEngine.getPendingCount();
      setPendingCount(count);
    };

    updateCount();

    return unsubscribe;
  }, []);

  const refresh = async () => {
    await syncEngine.processQueue();
  };

  return {
    pendingCount,
    refresh,
    isSyncing,
  };
}
