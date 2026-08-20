"use client";

import { useEffect } from "react";
import { Workbox } from "workbox-window";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const wb = new Workbox("/sw.js", { immediate: true });

    wb.addEventListener("waiting", () => {
      console.log("[SW] New version waiting to activate");
    });

    wb.addEventListener("activated", (event) => {
      if (event.isUpdate) {
        console.log("[SW] New version activated");
      }
    });

    wb.register();
  }, []);

  return null;
}
