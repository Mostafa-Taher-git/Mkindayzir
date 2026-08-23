"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { VAULT_ROUTES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { VaultSidebar } from "@/components/vault/vault-sidebar";
import { NoteList } from "@/components/vault/note-list";
import { Link } from "react-router-dom";

export default function VaultPage() {
  const [searchParams] = useSearchParams();
  const folderId = searchParams.get("folder") || undefined;
  const statusParam = searchParams.get("status") || undefined;
  const search = searchParams.get("search") || undefined;

  const { data: foldersData } = useQuery<{ folders: any[] }>({
    queryKey: ["vault", "folders"],
    queryFn: async () => {
      const res = await fetch("/api/vault/folders", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch folders");
      return res.json();
    },
  });

  const { data: notesData, isLoading } = useQuery<{ notes: any[]; pagination: any }>({
    queryKey: ["vault", "notes", folderId, statusParam, search],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (folderId) qs.set("folderId", folderId);
      if (statusParam) qs.set("status", statusParam);
      if (search) qs.set("search", search);
      const res = await fetch(`/api/vault/notes?${qs.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notes");
      return res.json();
    },
  });

  const folders = foldersData?.folders ?? [];
  const notes = notesData?.notes ?? [];
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
              {currentFolder ? `Folder: ${currentFolder.path}` : "Team knowledge base - all notes"}
            </p>
          </div>
          <Button asChild>
            <Link to={VAULT_ROUTES.NEW_NOTE}>New Note</Link>
          </Button>
        </div>

        {currentFolder && (
          <div className="flex items-center gap-2 mb-4">
            <Link
              to={VAULT_ROUTES.HOME}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              All Notes
            </Link>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading notes...</p>
        ) : (
          <NoteList notes={notes as any} />
        )}
      </div>
    </div>
  );
}
