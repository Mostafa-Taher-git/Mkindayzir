
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import { VAULT_ROUTES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { VaultSidebar } from "@/components/vault/vault-sidebar";
import { NoteList } from "@/components/vault/note-list";
import { VaultFolder } from "@/types";

function FolderIconSvg() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

export default function VaultPage() {
  const [searchParams] = useSearchParams();
  const folderId = searchParams.get("folder") || undefined;
  const tagId = searchParams.get("tag") || undefined;
  const search = searchParams.get("search") || undefined;

  const { data: foldersData } = useQuery<{ folders: VaultFolder[] }>({
    queryKey: ["vault", "folders"],
    queryFn: async () => {
      const res = await fetch("/api/vault/folders", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch folders");
      return res.json();
    },
  });

  const { data: notesData, isLoading } = useQuery<{ notes: any[]; pagination: any }>({
    queryKey: ["vault", "notes", folderId, tagId, search],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (folderId) qs.set("folderId", folderId);
      if (tagId) qs.set("tagId", tagId);
      if (search) qs.set("search", search);
      const res = await fetch(`/api/vault/notes?${qs.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notes");
      return res.json();
    },
  });

  const folders = foldersData?.folders ?? [];
  const notes = notesData?.notes ?? [];
  const currentFolder = folderId ? findFolder(folders, folderId) : null;
  const subfolders = currentFolder?.children ?? (folderId ? [] : folders);

  return (
    <div className="flex h-full">
      <VaultSidebar folders={folders} currentFolderId={folderId} />
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">
              {currentFolder ? currentFolder.name : "Knowledge Vault"}
            </h1>
            <p className="text-muted-foreground mt-1">
              {currentFolder ? currentFolder.path : "Team knowledge base — all your notes"}
            </p>
          </div>
          <Button asChild>
            <Link to={VAULT_ROUTES.NEW_NOTE}>New Note</Link>
          </Button>
        </div>

        {subfolders.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-3">
              {currentFolder ? "Subfolders" : "Root folders"}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {subfolders.map((sub) => (
                <Link
                  key={sub.id}
                  to={`${VAULT_ROUTES.FOLDERS}/${sub.id}`}
                  className="block group"
                >
                  <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <FolderIconSvg />
                        <CardTitle className="text-base group-hover:text-primary transition-colors">{sub.name}</CardTitle>
                        {(sub.children?.length ?? 0) > 0 && (
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            {sub.children!.length} sub
                          </span>
                        )}
                      </div>
                      <CardDescription className="text-xs">{sub.path}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-lg font-semibold mb-3">{currentFolder ? "Notes" : "All Notes"}</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading notes…</p>
          ) : (
            <NoteList notes={notes as any} loading={isLoading} />
          )}
        </div>
      </div>
    </div>
  );
}

function findFolder(folders: VaultFolder[], id: string): VaultFolder | null {
  for (const f of folders) {
    if (f.id === id) return f;
    if (f.children?.length) {
      const hit = findFolder(f.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

