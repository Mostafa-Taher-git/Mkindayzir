"use client";

import { useOnline } from "@/hooks/use-online";

export function OfflineBanner() {
  const isOnline = useOnline();

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-center py-2 text-sm font-medium">
      You&apos;re offline. Changes will sync when reconnected.
    </div>
  );
}
