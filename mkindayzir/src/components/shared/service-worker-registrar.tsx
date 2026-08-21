"use client";

import { useEffect } from "react";
import { serwistWorker } from "@/sw";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      serwistWorker.register().catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    }
  }, []);

  return null;
}
