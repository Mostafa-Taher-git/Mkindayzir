// src/config/features.ts
import { getConfig } from "@/lib/config";

export function isFeatureEnabled(feature: string): boolean {
  const config = getConfig();
  
  switch (feature) {
    case "realtime":
      return config.mode !== "personal";
    case "teams":
      return config.mode === "team" || config.mode === "enterprise";
    case "admin":
      return config.mode === "team" || config.mode === "enterprise";
    case "audit":
      return config.mode === "enterprise";
    case "ai":
      return true; // Always available if user provides API key
    case "offline":
      return true;
    case "graph":
      return true;
    default:
      return false;
  }
}
