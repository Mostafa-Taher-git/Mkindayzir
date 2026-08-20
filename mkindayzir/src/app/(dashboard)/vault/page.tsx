
import { api } from "@/lib/api";
import { VAULT_ROUTES } from "@/lib/constants";
import { VaultFolder, VaultNote, NoteStatus } from "@/types";
import { Button } from "@/components/ui/button";

import { VaultSidebar } from "@/components/vault/vault-sidebar";
import { NoteList } from "@/components/vault/note-list";
import Link from "next/link";

async function getFolders() {
  try {
    return await api.get<{ folders: VaultFolder[] }>("/api/vault/folders");
  } catch {
    return { folders: [] };
  }
}

async function getNotes(folderId?: string, status?: NoteStatus, search?: string) {
  try {
    const params = new URLSearchParams();
    if (folderId) params.set("folderId", folderId);
    if (status) params.set("status", status);
    if (search) params.set("search", search);
    return await api.get<{ notes: VaultNote[]; pagination: any }>(
      `/api/vault/notes?${params.toString()}`
    );
  } catch {
    return { notes: [], pagination: { total: 0 } };
  }
}


export default async function VaultPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  
  const params = await searchParams;
  const folderId = params.folder as string | undefined;
  const statusParam = params.status as string | undefined;
  const search = params.search as string | undefined;
  const status = statusParam ? (statusParam as NoteStatus) : undefined;

  const [foldersData, notesData] = await Promise.all([
    getFolders(),
    getNotes(folderId, status, search),
  ]);

  const folders = foldersData.folders || [];
  const notes = notesData.notes || [];
  const currentFolder = folderId ? folders.find((f) => f.id === folderId) : null;

  return (
    <div className="flex h-full">
      <VaultSidebar
        folders={folders}
        currentFolderId={folderId}
        onCreateFolder={() => {}}
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">
              {currentFolder ? currentFolder.name : "Knowledge Vault"}
            </h1>
            <p className="text-muted-foreground mt-1">
              {currentFolder
                ? `Folder: ${currentFolder.path}`
                : "Team knowledge base - all notes"}
            </p>
          </div>
          <Button asChild>
            <Link href={VAULT_ROUTES.NEW_NOTE}>New Note</Link>
          </Button>
        </div>

        {currentFolder && (
          <div className="flex items-center gap-2 mb-4">
            <Link
              href={VAULT_ROUTES.HOME}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              All Notes
            </Link>
          </div>
        )}

        <NoteList notes={notes} />
      </div>
    </div>
  );
}
