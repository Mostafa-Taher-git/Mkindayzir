import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type ArchiveFolder = {
  id: string;
  parentId: string | null;
  name: string;
  isDefault: boolean;
  entityType: string | null;
  position: number;
  count?: number;
  createdAt: string;
  updatedAt: string;
};

export type ArchiveItem = {
  id: string;
  entityType: string;
  entityTypeLabel: string;
  entityId: string | null;
  folderId: string | null;
  title: string;
  summary: string | null;
  payload: Record<string, unknown> | null;
  archivedAt: string;
  archivedBy: string;
  restoredAt: string | null;
  permanentlyDeletedAt: string | null;
  originalCreatedAt: string | null;
};

export function useArchiveFolders() {
  return useQuery<{ folders: ArchiveFolder[]; totalItems: number }>({
    queryKey: ["archive", "folders"],
    queryFn: () => api.get<{ folders: ArchiveFolder[]; totalItems: number }>("/api/archive/folders"),
  });
}

export function useArchiveItems(params: {
  folderId?: string;
  entityType?: string;
  search?: string;
  recent?: boolean;
  page?: number;
  perPage?: number;
}) {
  return useQuery<{ items: ArchiveItem[]; pagination: { page: number; perPage: number; total: number; totalPages: number } }>({
    queryKey: ["archive", "items", params],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params.folderId) qs.set("folderId", params.folderId);
      if (params.entityType) qs.set("entityType", params.entityType);
      if (params.search) qs.set("search", params.search);
      if (params.recent) qs.set("recent", "true");
      if (params.page) qs.set("page", String(params.page));
      if (params.perPage) qs.set("perPage", String(params.perPage));
      return api.get(`/api/archive/items?${qs.toString()}`);
    },
  });
}

export function useArchiveItem(id: string | null) {
  return useQuery<{ item: ArchiveItem }>({
    queryKey: ["archive", "item", id],
    queryFn: () => api.get<{ item: ArchiveItem }>(`/api/archive/items/${id}`),
    enabled: !!id,
  });
}

export function useCreateArchiveFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; parentId?: string | null }) =>
      api.post<{ folder: ArchiveFolder }>("/api/archive/folders", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archive", "folders"] });
    },
  });
}

export function useRenameArchiveFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch<{ folder: ArchiveFolder }>(`/api/archive/folders/${id}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archive", "folders"] });
    },
  });
}

export function useDeleteArchiveFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/archive/folders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archive", "folders"] });
    },
  });
}

export function useMoveArchiveItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      api.patch(`/api/archive/items/${id}/move`, { folderId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archive"] });
    },
  });
}

export function useBulkMoveArchiveItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemIds, folderId }: { itemIds: string[]; folderId: string | null }) =>
      api.post(`/api/archive/items/bulk-move`, { itemIds, folderId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archive"] });
    },
  });
}

export function useRestoreArchiveItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/archive/items/${id}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archive"] });
    },
  });
}

export function usePermanentDeleteArchiveItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/archive/items/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archive"] });
    },
  });
}

export function useBulkDeleteArchiveItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemIds: string[]) => api.post(`/api/archive/items/bulk-delete`, { itemIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archive"] });
    },
  });
}

export function useSnapshotArchive() {
  return useMutation({
    mutationFn: (data: { entityType: string; entityId?: string; title: string; summary?: string; payload?: Record<string, unknown>; folderId?: string }) =>
      api.post(`/api/archive/items/snapshot`, data),
  });
}
