import { useNavigate, useSearchParams, Link } from "react-router-dom";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NOTE_STATUSES, VAULT_ROUTES } from "@/lib/constants";
import { VaultNote, NoteStatus } from "@/types";


interface NoteListProps {
  notes: VaultNote[];
  loading?: boolean;
}

function NoteCard({ note }: { note: VaultNote }) {
  const statusColors: Record<NoteStatus, string> = {
    DRAFT: "secondary",
    PUBLISHED: "default",
    ARCHIVED: "outline",
  };

  return (
    <Link to={`${VAULT_ROUTES.NOTES}/${note.id}`}
      className="block group"
    >
      <div className="rounded-lg border bg-card p-4 hover:shadow-md transition-all cursor-pointer h-full">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-medium text-sm leading-tight group-hover:text-primary transition-colors line-clamp-2">
            {note.title || "Untitled"}
          </h3>
          <Badge variant={statusColors[note.status] as any} className="shrink-0">
            {note.status}
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
  const statusColors: Record<NoteStatus, string> = {
    DRAFT: "secondary",
    PUBLISHED: "default",
    ARCHIVED: "outline",
  };

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
        <Badge variant={statusColors[note.status] as any}>{note.status}</Badge>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {new Date(note.updatedAt).toLocaleDateString()}
      </td>
    </tr>
  );
}

export function NoteList({ notes, loading = false }: NoteListProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [viewMode, setViewMode] = React.useState<"grid" | "table">("grid");
  const [searchQuery, setSearchQuery] = React.useState(
    searchParams.get("search") || ""
  );
  const [debouncedSearch, setDebouncedSearch] = React.useState(searchQuery);

  const currentStatus = searchParams.get("status") as NoteStatus | null;

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  React.useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (debouncedSearch) {
      params.set("search", debouncedSearch);
    } else {
      params.delete("search");
    }
    const qs = params.toString();
    navigate(qs ? `?${qs}` : window.location.pathname);
  }, [debouncedSearch, navigate, searchParams]);

  const handleStatusChange = (status: NoteStatus) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status) {
      params.set("status", status);
    } else {
      params.delete("status");
    }
    const qs = params.toString();
    navigate(qs ? `?${qs}` : window.location.pathname);
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

  if (notes.length === 0) {
    return (
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
        <h3 className="text-lg font-semibold mb-1">No notes yet</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Get started by creating your first note.
        </p>
        <Link to={VAULT_ROUTES.NEW_NOTE}>
          <Button>Create Note</Button>
        </Link>
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {currentStatus ? `Status: ${currentStatus}` : "All Status"}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="ml-1"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleStatusChange("" as any)}>
                All Status
              </DropdownMenuItem>
              {NOTE_STATUSES.map((status) => (
                <DropdownMenuItem
                  key={status.value}
                  onClick={() => handleStatusChange(status.value as NoteStatus)}
                >
                  {status.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
          {notes.map((note) => (
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
              {notes.map((note) => (
                <NoteTableRow key={note.id} note={note} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
