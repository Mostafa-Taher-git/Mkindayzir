import { getSessionUser } from "@/lib/auth";
import { api } from "@/lib/api";
import { VAULT_ROUTES } from "@/lib/constants";
import { usePresence } from "@/hooks/use-presence";
import { PresenceIndicator } from "@/components/shared/presence-indicator";
import { VaultNote, NoteVersion } from "@/types";
import { VaultSidebar } from "@/components/vault/vault-sidebar";
import { NoteViewer } from "@/components/vault/note-viewer";
import { VersionHistory } from "@/components/vault/version-history";
import { notFound } from "next/navigation";

async function getNote(id: string) {
  try {
    return await api.get<{ note: VaultNote }>(`/api/vault/notes/${id}`);
  } catch {
    return null;
  }
}

async function getVersions(noteId: string) {
  try {
    return await api.get<{ versions: NoteVersion[] }>(`/api/vault/notes/${noteId}/versions`);
  } catch {
    return { versions: [] };
  }
}

async function getBacklinks(noteId: string) {
  try {
    return await api.get<{ backlinks: { id: string; title: string; context: string | null }[] }>(
      `/api/vault/notes/${noteId}/backlinks`
    );
  } catch {
    return { backlinks: [] };
  }
}

async function getFeedback(noteId: string) {
  try {
    return await api.get<{ feedback: any[] }>(`/api/vault/notes/${noteId}/feedback`);
  } catch {
    return { feedback: [] };
  }
}

async function getFolders() {
  try {
    const data = await api.get<{ folders: any[] }>("/api/vault/folders");
    return data.folders || [];
  } catch {
    return [];
  }
}

function NotePresence({ noteId, currentUserId }: { noteId: string; currentUserId: string }) {
  "use client";
  const { presentUsers } = usePresence("vault_note", noteId);
  return <PresenceIndicator users={presentUsers} currentUserId={currentUserId} />;
}

export default async function VaultNotePage({
  params,
}: {
  params: Promise<{ noteId: string }>;
}) {
  const user = await getSessionUser();
  const resolvedParams = await params;
  const noteId = resolvedParams.noteId;

  const [noteData, versionsData, backlinksData, feedbackData, folders] = await Promise.all([
    getNote(noteId),
    getVersions(noteId),
    getBacklinks(noteId),
    getFeedback(noteId),
    getFolders(),
  ]);

  if (!noteData || !noteData.note) {
    notFound();
  }

  const note = noteData.note;
  const versions = versionsData.versions || [];
  const backlinks = backlinksData.backlinks || [];
  const feedback = feedbackData.feedback || [];

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
      <VaultSidebar
        folders={folders}
        currentFolderId={note.folderId}
      />
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          <div className="flex items-center gap-2 mb-4">
            <a
              href={VAULT_ROUTES.HOME}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Vault
            </a>
            {note.folderId && (
              <>
                <span className="text-muted-foreground">/</span>
                <a
                  href={`${VAULT_ROUTES.FOLDERS}/${note.folderId}`}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Folder
                </a>
              </>
            )}
            <span className="text-muted-foreground">/</span>
            <span className="text-sm">{note.title || "Untitled"}</span>
            {user && <NotePresence noteId={noteId} currentUserId={user.id} />}
          </div>

          <NoteViewer
            note={note}
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
              <VersionHistory
                versions={versions}
                currentVersion={note.version}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
