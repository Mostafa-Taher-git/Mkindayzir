
import { api } from "@/lib/api";
import { VAULT_ROUTES } from "@/lib/constants";
import { VaultFolder, Tag } from "@/types";
import { VaultSidebar } from "@/components/vault/vault-sidebar";
import { NoteEditor } from "@/components/vault/note-editor";


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

export default async function NewNotePage() {
  
  const [folders, tags] = await Promise.all([getFolders(), getTags()]);

  const handleSave = async (data: {
    title: string;
    content: string;
    folderId: string | null;
    tagIds: string[];
    status: string;
  }) => {
    try {
      const response = await api.post<{ note: any }>("/api/vault/notes", {
        ...data,
        slug: data.title.toLowerCase().replace(/[^\w]+/g, "-").slice(0, 50),
      });
      window.location.href = `${VAULT_ROUTES.NOTES}/${response.note.id}`;
    } catch (e) {
      console.error("Failed to save note", e);
    }
  };

  return (
    <div className="flex h-full">
      <VaultSidebar
        folders={folders}
        currentFolderId={null}
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
            <span className="text-sm">New Note</span>
          </div>
          <NoteEditor
            folders={folders}
            availableTags={tags}
            onSave={handleSave}
          />
        </div>
      </div>
    </div>
  );
}
