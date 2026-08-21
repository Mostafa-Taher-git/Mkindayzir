"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/toast";

export function OfflineBanner() {
  const { toast } = useToast();
  const wasOnline = useRef(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => {
      if (!wasOnline.current) {
        toast({
          title: "Back Online",
          description: "Connection restored. Changes will sync.",
        });
      }
      wasOnline.current = true;
    };

    const handleOffline = () => {
      wasOnline.current = false;
      toast({
          title: "You're Offline",
          description: "Changes will sync when reconnected.",
        });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [toast]);

  return null;
}
