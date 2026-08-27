
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { usePresence } from "@/hooks/use-presence";
import { PresenceIndicator } from "@/components/shared/presence-indicator";
import { VaultNote, NoteVersion } from "@/types";
import { VaultSidebar } from "@/components/vault/vault-sidebar";
import { NoteViewer } from "@/components/vault/note-viewer";
import { VersionHistory } from "@/components/vault/version-history";
import { VAULT_ROUTES } from "@/lib/constants";
import { api } from "@/lib/api";

export default function VaultNotePage() {
  const { noteId } = useParams<{ noteId: string }>();
  const { user } = useAuth();

  const { data: noteData } = useQuery<{ note: VaultNote }>({
    queryKey: ["vault", "note", noteId],
    enabled: Boolean(noteId),
    queryFn: () => api.get<{ note: VaultNote }>(`/api/vault/notes/${noteId}`),
  });

  const { data: versionsData } = useQuery<{ versions: NoteVersion[] }>({
    queryKey: ["vault", "note", noteId, "versions"],
    enabled: Boolean(noteId),
    queryFn: () => api.get<{ versions: NoteVersion[] }>(`/api/vault/notes/${noteId}/versions`),
  });

  const { data: backlinksData } = useQuery<{ backlinks: { id: string; title: string; context: string | null }[] }>({
    queryKey: ["vault", "note", noteId, "backlinks"],
    enabled: Boolean(noteId),
    queryFn: () => api.get(`/api/vault/notes/${noteId}/backlinks`),
  });

  const { data: feedbackData } = useQuery<{ feedback: any[] }>({
    queryKey: ["vault", "note", noteId, "feedback"],
    enabled: Boolean(noteId),
    queryFn: () => api.get(`/api/vault/notes/${noteId}/feedback`),
  });

  const { data: foldersData } = useQuery<{ folders: any[] }>({
    queryKey: ["vault", "folders"],
    queryFn: () => api.get<{ folders: any[] }>("/api/vault/folders"),
  });

  if (!noteData?.note) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Note not found.</p>
      </div>
    );
  }

  const note = noteData.note;
  const versions = versionsData?.versions ?? [];
  const backlinks = backlinksData?.backlinks ?? [];
  const feedback = feedbackData?.feedback ?? [];
  const folders = foldersData?.folders ?? [];

  const handleEdit = () => {
    window.location.href = `${VAULT_ROUTES.NOTES}/${noteId}/edit`;
  };

  const handleArchive = async () => {
    try {
      await api.post(`/api/vault/notes/${noteId}/archive`, {});
      window.location.reload();
    } catch (e) {
      console.error("Failed to archive note", e);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this note?")) return;
    try {
      await api.delete(`/api/vault/notes/${noteId}`);
      window.location.href = VAULT_ROUTES.HOME;
    } catch (e) {
      console.error("Failed to delete note", e);
    }
  };

  const handleFeedbackSubmit = async (helpful: boolean, comment?: string) => {
    try {
      await api.post(`/api/vault/notes/${noteId}/feedback`, { helpful, comment });
      window.location.reload();
    } catch (e) {
      console.error("Failed to submit feedback", e);
    }
  };

  return (
    <div className="flex h-full">
      <VaultSidebar folders={folders} currentFolderId={note.folderId} />
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
            <Link to={VAULT_ROUTES.HOME} className="hover:text-foreground transition-colors">Vault</Link>
            {note.folderId && findFolder(folders, note.folderId) && (
              <>
                <span>/</span>
                <Link
                  to={`${VAULT_ROUTES.FOLDERS}/${note.folderId}`}
                  className="hover:text-foreground transition-colors"
                >
                  {findFolder(folders, note.folderId)!.name}
                </Link>
              </>
            )}
            <span>/</span>
            <span className="text-foreground">{note.title || "Untitled"}</span>
            {user && <NotePresence noteId={noteId!} currentUserId={user.id} />}
          </div>

          <NoteViewer
            note={note}
            folderLabel={note.folderId ? findFolder(folders, note.folderId)?.name : undefined}
            onEdit={handleEdit}
            onArchive={handleArchive}
            onDelete={handleDelete}
            versions={versions}
            backlinks={backlinks}
            feedback={feedback}
            onFeedbackSubmit={handleFeedbackSubmit}
          />

          {versions.length > 0 && (
            <div className="mt-8">
              <VersionHistory versions={versions} currentVersion={note.version} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NotePresence({ noteId, currentUserId }: { noteId: string; currentUserId: string }) {
  const { presentUsers } = usePresence("vault_note", noteId);
  return <PresenceIndicator users={presentUsers} currentUserId={currentUserId} />;
}

type FolderNode = { id: string; name?: string; children?: FolderNode[] };

function findFolder(folders: FolderNode[], id: string): FolderNode | null {
  for (const f of folders) {
    if (f.id === id) return f;
    if (f.children?.length) {
      const hit: FolderNode | null = findFolder(f.children, id);
      if (hit) return hit;
    }
  }
  return null;
}
