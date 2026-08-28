import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type WorkspaceContextValue =
  | { type: "personal" }
  | { type: "org"; orgId: string; orgName: string; orgType: "team" | "enterprise"; role: string };

const STORAGE_KEY = "mkindayzir.workspace";

export type OrgMembership = {
  id: string;
  orgId: string;
  orgName: string;
  orgType: "team" | "enterprise";
  role: string;
  memberCount?: number;
};

type Ctx = {
  active: WorkspaceContextValue;
  setActive: (next: WorkspaceContextValue) => void;
  refreshMyOrg: () => void;
};

const WorkspaceContext = React.createContext<Ctx | null>(null);

function defaultActive(): WorkspaceContextValue {
  return { type: "personal" };
}

function readStoredActive(): WorkspaceContextValue {
  if (typeof window === "undefined") return defaultActive();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultActive();
    const parsed = JSON.parse(raw);
    if (parsed?.type === "org" && typeof parsed.orgId === "string") {
      return {
        type: "org",
        orgId: parsed.orgId,
        orgName: typeof parsed.orgName === "string" ? parsed.orgName : "",
        orgType: parsed.orgType === "enterprise" ? "enterprise" : "team",
        role: typeof parsed.role === "string" ? parsed.role : "member",
      };
    }
  } catch {
    /* ignore */
  }
  return defaultActive();
}

function persist(value: WorkspaceContextValue) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [active, setActiveState] = React.useState<WorkspaceContextValue>(() => readStoredActive());
  const queryClient = useQueryClient();

  const setActive = React.useCallback(
    (next: WorkspaceContextValue) => {
      persist(next);
      setActiveState(next);
    },
    [],
  );

  const refreshMyOrg = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["organization", "mine"] });
  }, [queryClient]);

  const value = React.useMemo<Ctx>(
    () => ({ active, setActive, refreshMyOrg }),
    [active, setActive, refreshMyOrg],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = React.useContext(WorkspaceContext);
  if (!ctx) return { type: "personal" };
  return ctx.active;
}

export function useWorkspaceSetter(): (next: WorkspaceContextValue) => void {
  const ctx = React.useContext(WorkspaceContext);
  return ctx?.setActive ?? (() => {});
}

export function useWorkspaceRefresh(): () => void {
  const ctx = React.useContext(WorkspaceContext);
  return ctx?.refreshMyOrg ?? (() => {});
}

export function useMyOrg() {
  return useQuery<{ organization: OrgMembership | null }>({
    queryKey: ["organization", "mine"],
    queryFn: async () => {
      const r = await api.get<{ organization: OrgMembership | null }>(
        "/api/organizations/mine",
      );
      return { organization: r.organization };
    },
    staleTime: 60_000,
  });
}
