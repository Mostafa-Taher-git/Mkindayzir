
import { api } from "@/lib/api";
import { VAULT_ROUTES } from "@/lib/constants";
import { VaultFolder, VaultNote } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { VaultSidebar } from "@/components/vault/vault-sidebar";
import { NoteList } from "@/components/vault/note-list";
import Link from "next/link";
import { notFound } from "next/navigation";

async function getFolder(id: string) {
  try {
    return await api.get<{ folder: VaultFolder }>(`/api/vault/folders/${id}`);
  } catch {
    return null;
  }
}

async function getSubfolders(parentId: string) {
  try {
    const data = await api.get<{ folders: VaultFolder[] }>("/api/vault/folders");
    return (data.folders || []).filter((f: VaultFolder) => f.parentId === parentId);
  } catch {
    return [];
  }
}

async function getNotesInFolder(folderId: string) {
  try {
    const data = await api.get<{ notes: VaultNote[]; pagination: any }>(
      `/api/vault/notes?folderId=${folderId}`
    );
    return data.notes || [];
  } catch {
    return [];
  }
}

export default async function VaultFolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  
  const resolvedParams = await params;
  const folderId = resolvedParams.folderId;

  const [folderData, subfolders, notes] = await Promise.all([
    getFolder(folderId),
    getSubfolders(folderId),
    getNotesInFolder(folderId),
  ]);

  if (!folderData || !folderData.folder) {
    notFound();
  }

  const folder = folderData.folder;
  const allFolders = [folder, ...subfolders];

  return (
    <div className="flex h-full">
      <VaultSidebar
        folders={allFolders}
        currentFolderId={folderId}
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Link href={VAULT_ROUTES.HOME} className="hover:text-foreground transition-colors">
                Vault
              </Link>
              <span>/</span>
              <span className="text-foreground">{folder.name}</span>
            </div>
            <h1 className="text-3xl font-bold">{folder.name}</h1>
            <p className="text-muted-foreground mt-1">{folder.path}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`${VAULT_ROUTES.FOLDERS}/${folderId}`}>Open Folder</Link>
            </Button>
            <Button asChild>
              <Link href={VAULT_ROUTES.NEW_NOTE}>New Note</Link>
            </Button>
          </div>
        </div>

        {subfolders.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Subfolders</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {subfolders.map((sub) => (
                <Link
                  key={sub.id}
                  href={`${VAULT_ROUTES.FOLDERS}/${sub.id}`}
                  className="block group"
                >
                  <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-muted-foreground"
                        >
                          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                        </svg>
                        <CardTitle className="text-base group-hover:text-primary transition-colors">
                          {sub.name}
                        </CardTitle>
                      </div>
                      <CardDescription className="text-xs">
                        {sub.path}
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
