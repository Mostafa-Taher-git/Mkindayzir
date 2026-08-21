import { getSessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { VAULT_ROUTES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { VaultSidebar } from "@/components/vault/vault-sidebar";
import { NoteList } from "@/components/vault/note-list";
import Link from "next/link";

async function getFolders() {
  const folders = await prisma.vaultFolder.findMany({
    where: { deletedAt: null },
    orderBy: { position: "asc" },
  });
  return folders.map((f) => ({
    ...f,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    deletedAt: f.deletedAt?.toISOString() ?? null,
  }));
}

async function getNotes(folderId?: string, status?: string, search?: string) {
  const where: any = { deletedAt: null };
  if (folderId) where.folderId = folderId;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { content: { contains: search } },
    ];
  }

  const [notes, total] = await Promise.all([
    prisma.vaultNote.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: { folder: true, tags: { include: { tag: true } }, author: true },
      take: 50,
    }),
    prisma.vaultNote.count({ where }),
  ]);

  const serialized = notes.map((n) => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    deletedAt: n.deletedAt?.toISOString() ?? null,
    publishedAt: n.publishedAt?.toISOString() ?? null,
    folder: n.folder ? {
      ...n.folder,
      createdAt: n.folder.createdAt.toISOString(),
      updatedAt: n.folder.updatedAt.toISOString(),
      deletedAt: n.folder.deletedAt?.toISOString() ?? null,
    } : null,
    author: n.author ? {
      ...n.author,
      createdAt: n.author.createdAt.toISOString(),
      updatedAt: n.author.updatedAt.toISOString(),
    } : null,
  }));

  return { notes: serialized, pagination: { total } };
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

  const [folders, notesData] = await Promise.all([
    getFolders(),
    getNotes(folderId, statusParam, search),
  ]);

  const notes = notesData.notes || [];
  const currentFolder = folderId ? folders.find((f) => f.id === folderId) : null;

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

        <NoteList notes={notes as any} />
      </div>
    </div>
  );
}
