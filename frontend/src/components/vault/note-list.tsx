import { useNavigate, useSearchParams, Link } from "react-router-dom";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VAULT_ROUTES } from "@/lib/constants";
import { VaultNote, Tag } from "@/types";
import { api } from "@/lib/api";


interface NoteListProps {
  notes: VaultNote[];
  loading?: boolean;
}

function NoteCard({ note }: { note: VaultNote }) {
  return (
    <Link to={`${VAULT_ROUTES.NOTES}/${note.id}`}
      className="block group"
    >
      <div className="rounded-lg border bg-card p-4 hover:shadow-md transition-all cursor-pointer h-full">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-medium text-sm leading-tight group-hover:text-primary transition-colors line-clamp-2">
            {note.title || "Untitled"}
          </h3>
          <Badge variant="secondary" className="shrink-0">
            {note.folderName || "No Folder"}
          </Badge>
        </div>
        {note.excerpt && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
            {note.excerpt}
          </p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {note.tags && note.tags.length > 0 && (
              <div className="flex gap-1">
                {note.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag.id}
                    className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                  >
                    {tag.name}
                  </span>
                ))}
                {note.tags.length > 2 && (
                  <span className="text-xs text-muted-foreground">
                    +{note.tags.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(note.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </Link>
  );
}

function NoteTableRow({ note }: { note: VaultNote }) {
  return (
    <tr className="border-b hover:bg-muted/50 transition-colors">
      <td className="px-4 py-3">
        <Link to={`${VAULT_ROUTES.NOTES}/${note.id}`}
          className="text-sm font-medium hover:text-primary transition-colors"
        >
          {note.title || "Untitled"}
        </Link>
        {note.excerpt && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {note.excerpt}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1">
          {note.tags && note.tags.length > 0 ? (
            note.tags.slice(0, 3).map((tag) => (
              <span
                key={tag.id}
                className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
              >
                {tag.name}
              </span>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge variant="secondary">{note.folderName || "No Folder"}</Badge>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {new Date(note.updatedAt).toLocaleDateString()}
      </td>
    </tr>
  );
}

export function NoteList({ notes, loading = false }: NoteListProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeTagId, setActiveTagId] = React.useState<string>("");
  const [viewMode, setViewMode] = React.useState<"grid" | "table">("grid");

  const { data: tagsData } = useQuery<{ tags: Tag[] }>({
    queryKey: ["vault", "tags"],
    queryFn: async () => {
      const res = await api.get<{ tags: Tag[] }>("/api/vault/tags");
      return res;
    },
    staleTime: 30_000,
  });
  const tags = tagsData?.tags ?? [];

  const visibleNotes = React.useMemo(() => {
    let out = notes;
    if (activeTagId) {
      out = out.filter((n) => (n.tags ?? []).some((t) => t.id === activeTagId));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      out = out.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          (n.content ?? "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [notes, activeTagId, searchQuery]);

  const setActiveTag = (id: string) => setActiveTagId(id);
  const clearFilters = () => {
    setActiveTagId("");
    setSearchQuery("");
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-10 w-64 bg-muted rounded-md animate-pulse" />
          <div className="h-10 w-32 bg-muted rounded-md animate-pulse" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (visibleNotes.length === 0 && !loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1">
            <Input
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
            <select
              value={activeTagId}
              onChange={(e) => setActiveTag(e.target.value)}
              className="h-9 rounded-md border bg-transparent px-3 py-1 text-sm"
            >
              <option value="">All Tags</option>
              {tags.length === 0 ? (
                <option value="" disabled>No tags yet</option>
              ) : (
                tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode("grid")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" />
              </svg>
            </Button>
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode("table")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18" /><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" />
              </svg>
            </Button>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground mb-4"
          >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" x2="8" y1="13" y2="13" />
            <line x1="16" x2="8" y1="17" y2="17" />
            <line x1="10" x2="8" y1="9" y2="9" />
          </svg>
          <h3 className="text-lg font-semibold mb-1">No notes match this filter</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Try a different tag or clear the filter to see all notes.
          </p>
          <Button variant="outline" onClick={() => setActiveTag("")}>
            Clear filter
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />
            <select
              value={activeTagId}
              onChange={(e) => setActiveTag(e.target.value)}
              className="h-9 rounded-md border bg-transparent px-3 py-1 text-sm"
            >
              <option value="">All Tags</option>
              {tags.length === 0 ? (
                <option value="" disabled>No tags yet</option>
              ) : (
                tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))
              )}
            </select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode("grid")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="7" height="7" x="3" y="3" rx="1" />
              <rect width="7" height="7" x="14" y="3" rx="1" />
              <rect width="7" height="7" x="3" y="14" rx="1" />
              <rect width="7" height="7" x="14" y="14" rx="1" />
            </svg>
          </Button>
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode("table")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3v18" />
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M3 9h18" />
              <path d="M3 15h18" />
            </svg>
          </Button>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleNotes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Title
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Tags
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
          {visibleNotes.map((note) => (
                <NoteTableRow key={note.id} note={note} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
