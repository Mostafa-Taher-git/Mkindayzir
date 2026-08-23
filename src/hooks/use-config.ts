import { useEffect, useState } from "react";

interface PublicConfig {
  mode: string;
  registrationEnabled: boolean;
}

/**
 * Lightweight public config consumed by the auth screen and the dashboard
 * layout. Falls back to safe personal-mode defaults if the endpoint is
 * unavailable (e.g. before the FastAPI backend is reachable).
 */
export function useConfig(): PublicConfig {
  const [config, setConfig] = useState<PublicConfig>({
    mode: "personal",
    registrationEnabled: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.mode === "string") {
          setConfig({
            mode: data.mode,
            registrationEnabled: Boolean(data.registrationEnabled),
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}
