
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { VIEW_MODES } from "@/lib/constants";

interface BoardToolbarProps {
  boardId: string;
  search: string;
  onSearchChange: (value: string) => void;
  viewMode: string;
  onViewModeChange: (mode: string) => void;
  memberFilter: string;
  onMemberFilterChange: (value: string) => void;
  labelFilter: string;
  onLabelFilterChange: (value: string) => void;
  onOpenArchive?: () => void;
}

function BoardToolbar({
  boardId,
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
  memberFilter,
  onMemberFilterChange,
  labelFilter,
  onLabelFilterChange,
  onOpenArchive,
}: BoardToolbarProps) {
  const { data: labelsData } = useQuery({
    queryKey: ["labels", boardId],
    queryFn: async () => {
      const res = await fetch(`/api/boards/${boardId}/labels`, {credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return { labels: [] };
      return res.json();
    },
  });

  // Real member options from the user directory.
  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include", cache: "no-store" });
      if (!res.ok) return { users: [] };
      return res.json();
    },
  });

  const labels = labelsData?.labels ?? [];
  const users = usersData?.users ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Search cards..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="h-9 w-full sm:w-64"
      />

      <Select
        options={[
          { value: "", label: "All Members" },
          ...users.map((u: { id: string; displayName: string }) => ({ value: u.id, label: u.displayName })),
        ]}
        value={memberFilter}
        onChange={(e) => onMemberFilterChange(e.target.value)}
        className="h-9"
      />

      <Select
        options={[
          { value: "", label: "All Labels" },
          ...labels.map((l: { id: string; name: string }) => ({ value: l.id, label: l.name })),
        ]}
        value={labelFilter}
        onChange={(e) => onLabelFilterChange(e.target.value)}
        className="h-9"
      />

      <div className="flex items-center border rounded-md overflow-hidden">
        {VIEW_MODES.map((mode) => (
          <Button
            key={mode.value}
            variant={viewMode === mode.value ? "default" : "ghost"}
            size="sm"
            className="rounded-none border-0"
            onClick={() => onViewModeChange(mode.value)}
          >
            {mode.label}
          </Button>
        ))}
      </div>

      {onOpenArchive && (
        <Button variant="secondary" size="sm" onClick={onOpenArchive}>
          Archive
        </Button>
      )}
    </div>
  );
}

export { BoardToolbar };
