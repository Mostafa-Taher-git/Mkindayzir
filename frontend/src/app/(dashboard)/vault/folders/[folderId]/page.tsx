
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { VAULT_ROUTES } from "@/lib/constants";
import { VaultFolder, VaultNote } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { VaultSidebar } from "@/components/vault/vault-sidebar";
import { NoteList } from "@/components/vault/note-list";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { getFolderKind, folderKindClass } from "@/lib/folder-kind";

export default function VaultFolderPage() {
  const { folderId } = useParams<{ folderId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const tagId = searchParams.get("tag") || undefined;

  const { data: folderData } = useQuery<{ folder: VaultFolder }>({
    queryKey: ["vault", "folder", folderId],
    enabled: Boolean(folderId),
    queryFn: () => api.get<{ folder: VaultFolder }>(`/api/vault/folders/${folderId}`),
  });

  const { data: foldersData } = useQuery<{ folders: VaultFolder[] }>({
    queryKey: ["vault", "folders"],
    queryFn: () => api.get<{ folders: VaultFolder[] }>("/api/vault/folders"),
  });

  const { data: notesData } = useQuery<{ notes: VaultNote[] }>({
    queryKey: ["vault", "notes", "folder", folderId, tagId],
    enabled: Boolean(folderId),
    queryFn: () => {
      const qs = new URLSearchParams();
      qs.set("folderId", folderId!);
      if (tagId) qs.set("tagId", tagId);
      return api.get<{ notes: VaultNote[] }>(`/api/vault/notes?${qs.toString()}`);
    },
  });

  const deleteFolder = useMutation({
    mutationFn: () => api.delete(`/api/vault/folders/${folderId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault", "folders"] });
      queryClient.invalidateQueries({ queryKey: ["vault", "folder", folderId] });
      queryClient.invalidateQueries({ queryKey: ["vault", "notes", "folder", folderId] });
      toast({ title: "Folder deleted" });
      navigate(VAULT_ROUTES.HOME);
    },
    onError: (e) => toast({ title: "Cannot delete", description: String(e) }),
  });

  function onDelete() {
    if (!folder) return;
    const hasContent = subfolders.length > 0 || notes.length > 0;
    const message = hasContent
      ? `Folder "${folder.name}" contains ${notes.length} note(s) and ${subfolders.length} subfolder(s). The server will only allow delete if it's empty. Continue?`
      : `Delete folder "${folder.name}"?`;
    if (!window.confirm(message)) return;
    deleteFolder.mutate();
  }

  if (!folderData?.folder) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Folder not found.</p>
      </div>
    );
  }

  const folder = folderData.folder;
  const allFolders = foldersData?.folders ?? [];
  const notes = notesData?.notes ?? [];
  const subfolders = folderId ? collectChildren(allFolders, folderId) : [];

  return (
    <div className="flex h-full">
      <VaultSidebar folders={allFolders} currentFolderId={folderId} />
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Link to={VAULT_ROUTES.HOME} className="hover:text-foreground transition-colors">Vault</Link>
              {folderId && getAncestors(allFolders, folderId).map((ancestor) => (
                <span key={ancestor.id} className="flex items-center gap-2">
                  <span>/</span>
                  <Link to={`${VAULT_ROUTES.FOLDERS}/${ancestor.id}`} className="hover:text-foreground transition-colors">{ancestor.name}</Link>
                </span>
              ))}
              <span>/</span>
              <span className="text-foreground">{folder.name}</span>
            </div>
            <h1 className="text-3xl font-bold">{folder.name}</h1>
            <p className="text-muted-foreground mt-1">
              {getAncestors(allFolders, folderId!).map((a) => a.name).join(" / ") || "Root"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link to={VAULT_ROUTES.NEW_NOTE}>New Note</Link>
            </Button>
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={deleteFolder.isPending}
            >
              {deleteFolder.isPending ? "Deleting…" : "Delete folder"}
            </Button>
          </div>
        </div>

        {subfolders.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Subfolders</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {subfolders.map((sub) => (
                <Link key={sub.id} to={`${VAULT_ROUTES.FOLDERS}/${sub.id}`} className="block group">
                  <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>
                        <CardTitle className="text-base group-hover:text-primary transition-colors">
                          {sub.name}
                        </CardTitle>
                      </div>
                      <CardDescription className="text-xs">
                        {getAncestors(allFolders, sub.id).map((a) => a.name).join(" / ") || "Root"}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-lg font-semibold mb-3">Notes</h2>
          <NoteList notes={notes} />
        </div>
      </div>
    </div>
  );
}

function collectChildren(folders: VaultFolder[], parentId: string): VaultFolder[] {
  for (const f of folders) {
    if (f.id === parentId) return f.children ?? [];
    if (f.children?.length) {
      const found = collectChildren(f.children, parentId);
      if (found.length) return found;
    }
  }
  return [];
}

function getAncestors(folders: VaultFolder[], targetId: string): VaultFolder[] {
  const path: VaultFolder[] = [];
  function walk(items: VaultFolder[], trail: VaultFolder[]): boolean {
    for (const f of items) {
      if (f.id === targetId) {
        path.push(...trail);
        return true;
      }
      if (f.children?.length && walk(f.children, [...trail, f])) return true;
    }
    return false;
  }
  walk(folders, []);
  return path;
}
