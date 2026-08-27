import { useState, useMemo, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { VaultSidebar } from "@/components/vault/vault-sidebar";
import {
  useArchiveFolders,
  useArchiveItems,
  useRestoreArchiveItem,
  usePermanentDeleteArchiveItem,
  type ArchiveItem,
  type ArchiveFolder,
} from "@/hooks/use-archive";
import { cn } from "@/lib/utils";
import type { VaultFolder } from "@/types";

export default function VaultArchivePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const searchInput = searchParams.get("search") || "";
  const [query, setQuery] = useState(searchInput);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (query) next.set("search", query);
      else next.delete("search");
      if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: foldersData } = useQuery<{ folders: VaultFolder[] }>({
    queryKey: ["vault", "folders"],
    queryFn: () => fetch("/api/vault/folders", { credentials: "include" }).then((r) => r.json()),
  });
  const noteFolders = foldersData?.folders ?? [];

  const { data: archiveFoldersData } = useArchiveFolders();
  const archiveFolders = archiveFoldersData?.folders ?? [];

  const { data: itemsData, isLoading } = useArchiveItems({ search: searchInput || undefined, perPage: 200 });
  const items: ArchiveItem[] = itemsData?.items ?? [];

  const restore = useRestoreArchiveItem();
  const permDelete = usePermanentDeleteArchiveItem();

  const openItem = openItemId ? items.find((i) => i.id === openItemId) : null;

  function onRestore(item: ArchiveItem) {
    restore.mutate(item.id, {
      onSuccess: () => {
        toast({ title: "Restored", description: `${item.title} returned to its original place.` });
        if (item.entityType === "note" && item.entityId) {
          window.location.href = `/vault/notes/${item.entityId}`;
        }
      },
      onError: (e) => toast({ title: "Restore failed", description: String(e) }),
    });
  }

  function onPermDelete(item: ArchiveItem) {
    if (!confirm(`Permanently delete "${item.title}"? This cannot be undone.`)) return;
    permDelete.mutate(item.id, { onSuccess: () => toast({ title: "Deleted permanently" }) });
  }

  return (
    <div className="flex h-full">
      <VaultSidebar folders={noteFolders} currentFolderId={null} />
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Archive</h1>
            <p className="text-muted-foreground mt-1">Everything you archived from anywhere in the app</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-1">
              <Input
                placeholder="Search archived items…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <div className="flex items-center gap-1">
              <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("grid")}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="7" height="7" x="3" y="3" rx="1" />
                  <rect width="7" height="7" x="14" y="3" rx="1" />
                  <rect width="7" height="7" x="3" y="14" rx="1" />
                  <rect width="7" height="7" x="14" y="14" rx="1" />
                </svg>
              </Button>
              <Button variant={viewMode === "table" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("table")}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v18" /><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" />
                </svg>
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-40 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <ArchiveEmptyState />
          ) : viewMode === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <ArchiveCard key={item.id} item={item} archiveFolders={archiveFolders} onOpen={() => setOpenItemId(item.id)} onRestore={() => onRestore(item)} onDelete={() => onPermDelete(item)} />
              ))}
            </div>
          ) : (
            <ArchiveTable items={items} archiveFolders={archiveFolders} onOpen={(id) => setOpenItemId(id)} onRestore={onRestore} onDelete={onPermDelete} />
          )}
        </div>
      </div>

      {openItem && (
        <ItemDrawer
          item={openItem}
          archiveFolders={archiveFolders}
          onClose={() => setOpenItemId(null)}
          onRestore={() => onRestore(openItem)}
          onDelete={() => onPermDelete(openItem)}
        />
      )}
    </div>
  );
}

function ArchiveCard({ item, archiveFolders, onOpen, onRestore, onDelete }: { item: ArchiveItem; archiveFolders: ArchiveFolder[]; onOpen: () => void; onRestore: () => void; onDelete: () => void }) {
  const folderName = item.folderId ? archiveFolders.find((f) => f.id === item.folderId)?.name : null;
  return (
    <div className="rounded-lg border bg-card p-4 hover:shadow-md transition-all cursor-pointer h-full" onClick={onOpen}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-medium text-sm leading-tight line-clamp-2">
          {item.title}
        </h3>
        <Badge variant="outline" className="shrink-0 text-[10px]">{item.entityTypeLabel}</Badge>
      </div>
      {item.summary && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{item.summary}</p>
      )}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{new Date(item.archivedAt).toLocaleDateString()}</span>
        {folderName && <span className="truncate ml-2" title={folderName}>{folderName}</span>}
      </div>
      <div className="mt-3 flex items-center gap-1 opacity-0 group-hover:opacity-100">
        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onRestore(); }}>Restore</Button>
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onDelete(); }}>Delete</Button>
      </div>
    </div>
  );
}

function ArchiveTable({ items, archiveFolders, onOpen, onRestore, onDelete }: { items: ArchiveItem[]; archiveFolders: ArchiveFolder[]; onOpen: (id: string) => void; onRestore: (item: ArchiveItem) => void; onDelete: (item: ArchiveItem) => void }) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Title</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Type</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Folder</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Archived</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const folderName = item.folderId ? archiveFolders.find((f) => f.id === item.folderId)?.name : "—";
            return (
              <tr key={item.id} className="border-b hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3">
                  <button onClick={() => onOpen(item.id)} className="text-sm font-medium hover:text-primary transition-colors">
                    {item.title}
                  </button>
                </td>
                <td className="px-4 py-3 text-xs"><Badge variant="outline">{item.entityTypeLabel}</Badge></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{folderName}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(item.archivedAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => onRestore(item)}>Restore</Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(item)}>Delete</Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ArchiveEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground mb-4">
        <rect width="20" height="5" x="2" y="3" rx="1" />
        <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
        <path d="M10 12h4" />
      </svg>
      <h3 className="text-lg font-semibold mb-1">Nothing archived yet</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Anything you archive from anywhere in the app will land here.
      </p>
    </div>
  );
}

function ItemDrawer({ item, archiveFolders, onClose, onRestore, onDelete }: { item: ArchiveItem; archiveFolders: ArchiveFolder[]; onClose: () => void; onRestore: () => void; onDelete: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <aside className="relative w-full max-w-md h-full bg-background border-l overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{item.entityTypeLabel}</p>
            <h2 className="text-xl font-bold">{item.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">✕</button>
        </div>

        {item.summary && <p className="text-sm text-muted-foreground mb-4">{item.summary}</p>}

        <dl className="space-y-2 text-xs mb-6">
          <div className="flex justify-between"><dt className="text-muted-foreground">Archived</dt><dd>{new Date(item.archivedAt).toLocaleString()}</dd></div>
          {item.folderId && <div className="flex justify-between"><dt className="text-muted-foreground">In folder</dt><dd>{archiveFolders.find((f) => f.id === item.folderId)?.name}</dd></div>}
          {item.originalCreatedAt && <div className="flex justify-between"><dt className="text-muted-foreground">Originally created</dt><dd>{new Date(item.originalCreatedAt).toLocaleDateString()}</dd></div>}
        </dl>

        {item.payload && (
          <details className="mb-6">
            <summary className="cursor-pointer text-xs font-semibold mb-2">Snapshot data</summary>
            <pre className="text-[10px] bg-muted p-2 overflow-x-auto border">
{JSON.stringify(item.payload, null, 2)}
            </pre>
          </details>
        )}

        <div className="space-y-2">
          <Button onClick={onRestore} className="w-full">Restore</Button>
          <Button onClick={onDelete} variant="destructive" className="w-full">Delete permanently</Button>
        </div>
      </aside>
    </div>
  );
}
