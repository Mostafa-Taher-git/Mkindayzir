import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const STORM_BASE = "/api/storms";

export function useStorms() {
  return useQuery({
    queryKey: ["storms"],
    queryFn: async () => {
      const res = await fetch(STORM_BASE, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });
}

export function useCreateStorm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; positionX?: number; positionY?: number }) => {
      const res = await fetch(STORM_BASE, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: { message: "Create failed" } }))).error?.message ?? "Create failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storms"] }),
  });
}

export function useUpdateStorm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const res = await fetch(`${STORM_BASE}/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: { message: "Update failed" } }))).error?.message ?? "Update failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storms"] }),
  });
}

export function useDeleteStorm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${STORM_BASE}/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok && res.status !== 204) throw new Error("Delete failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storms"] }),
  });
}

export function useCreateLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sourceId, targetId, sourceCorner, targetCorner }: { sourceId: string; targetId: string; sourceCorner: number; targetCorner: number }) => {
      const res = await fetch(`${STORM_BASE}/${sourceId}/links`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, sourceCorner, targetCorner }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: { message: "Link failed" } }))).error?.message ?? "Link failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storms"] }),
  });
}

export function useDeleteLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ stormId, linkId }: { stormId: string; linkId: string }) => {
      const res = await fetch(`${STORM_BASE}/${stormId}/links/${linkId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok && res.status !== 204) throw new Error("Delete link failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storms"] }),
  });
}

export function useMoveSubtree() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ stormId, dx, dy }: { stormId: string; dx: number; dy: number }) => {
      const res = await fetch(`${STORM_BASE}/${stormId}/move-subtree`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dx, dy }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: { message: "Move failed" } }))).error?.message ?? "Move failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storms"] }),
  });
}
