
import { api } from "@/lib/api";
import { VAULT_ROUTES } from "@/lib/constants";
import { VaultFolder, Tag } from "@/types";
import { VaultSidebar } from "@/components/vault/vault-sidebar";
import { NoteEditor } from "@/components/vault/note-editor";
import { notFound } from "next/navigation";

async function getNote(id: string) {
  try {
    return await api.get<{ note: any }>(`/api/vault/notes/${id}`);
  } catch {
    return null;
  }
}

async function getFolders() {
  try {
    const data = await api.get<{ folders: VaultFolder[] }>("/api/vault/folders");
    return data.folders || [];
  } catch {
    return [];
  }
}

async function getTags() {
  try {
    const data = await api.get<{ tags: Tag[] }>("/api/vault/tags");
    return data.tags || [];
  } catch {
    return [];
  }
}

export default async function EditNotePage({
  params,
}: {
  params: Promise<{ noteId: string }>;
}) {
  
  const resolvedParams = await params;
  const noteId = resolvedParams.noteId;

  const [noteData, folders, tags] = await Promise.all([
    getNote(noteId),
    getFolders(),
    getTags(),
  ]);

  if (!noteData || !noteData.note) {
    notFound();
  }

  const note = noteData.note;

  const handleSave = async (data: {
    title: string;
    content: string;
    folderId: string | null;
    tagIds: string[];
    status: string;
  }) => {
    try {
      await api.patch(`/api/vault/notes/${noteId}`, data);
      window.location.href = `${VAULT_ROUTES.NOTES}/${noteId}`;
    } catch (e) {
      console.error("Failed to update note", e);
    }
  };

  return (
    <div className="flex h-full">
      <VaultSidebar
        folders={folders}
        currentFolderId={note.folderId}
        onCreateFolder={() => {}}
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <a
              href={VAULT_ROUTES.HOME}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Vault
            </a>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm">Edit Note</span>
          </div>
          <NoteEditor
            note={note}
            folders={folders}
            availableTags={tags}
            onSave={handleSave}
          />
        </div>
      </div>
    </div>
  );
}
