
import { useQuery } from "@tanstack/react-query";
import { VAULT_ROUTES } from "@/lib/constants";
import { VaultFolder, Tag } from "@/types";
import { VaultSidebar } from "@/components/vault/vault-sidebar";
import { NoteEditor } from "@/components/vault/note-editor";
import { api } from "@/lib/api";

export default function NewNotePage() {
  const { data: foldersData } = useQuery<{ folders: VaultFolder[] }>({
    queryKey: ["vault", "folders"],
    queryFn: () => api.get<{ folders: VaultFolder[] }>("/api/vault/folders"),
  });

  const { data: tagsData } = useQuery<{ tags: Tag[] }>({
    queryKey: ["vault", "tags"],
    queryFn: () => api.get<{ tags: Tag[] }>("/api/vault/tags"),
  });

  const folders = foldersData?.folders ?? [];
  const tags = tagsData?.tags ?? [];

  return (
    <div className="flex h-full">
      <VaultSidebar folders={folders} currentFolderId={null} />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <a href={VAULT_ROUTES.HOME} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Vault</a>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm">New Note</span>
          </div>
          <NoteEditor folders={folders} availableTags={tags} />
        </div>
      </div>
    </div>
  );
}
