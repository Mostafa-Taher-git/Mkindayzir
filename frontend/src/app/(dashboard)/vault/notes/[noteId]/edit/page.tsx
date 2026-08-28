
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { VAULT_ROUTES } from "@/lib/constants";
import { VaultFolder, Tag } from "@/types";
import { VaultSidebar } from "@/components/vault/vault-sidebar";
import { NoteEditor } from "@/components/vault/note-editor";
import { api } from "@/lib/api";

export default function EditNotePage() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Save wires the editor's onSave to the notes PATCH endpoint. Without it the
  // editor's Save/Publish buttons were silent no-ops.
  const saveMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      content: string;
      folderId: string | null;
      tagIds: string[];
    }) => {
      const res = await fetch(`/api/vault/notes/${noteId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || "Failed to save note");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault", "note", noteId] });
      queryClient.invalidateQueries({ queryKey: ["vault", "note", noteId, "versions"] });
      navigate(`/vault/notes/${noteId}`);
    },
  });

  const { data: noteData } = useQuery<{ note: any }>({
    queryKey: ["vault", "note", noteId],
    enabled: Boolean(noteId),
    queryFn: () => api.get<{ note: any }>(`/api/vault/notes/${noteId}`),
  });

  const { data: foldersData } = useQuery<{ folders: VaultFolder[] }>({
    queryKey: ["vault", "folders"],
    queryFn: () => api.get<{ folders: VaultFolder[] }>("/api/vault/folders"),
  });

  const { data: tagsData } = useQuery<{ tags: Tag[] }>({
    queryKey: ["vault", "tags"],
    queryFn: () => api.get<{ tags: Tag[] }>("/api/vault/tags"),
  });

  if (!noteData?.note) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Note not found.</p>
      </div>
    );
  }

  const note = noteData.note;
  const folders = foldersData?.folders ?? [];
  const tags = tagsData?.tags ?? [];

  return (
    <div className="flex h-full">
      <VaultSidebar folders={folders} currentFolderId={note.folderId} />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <a href={VAULT_ROUTES.HOME} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Vault</a>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm">Edit Note</span>
          </div>
          <NoteEditor
          note={note}
          folders={folders}
          availableTags={tags}
          saving={saveMutation.isPending}
          onSave={async (data) => { await saveMutation.mutateAsync(data); }}
        />
        </div>
      </div>
    </div>
  );
}
