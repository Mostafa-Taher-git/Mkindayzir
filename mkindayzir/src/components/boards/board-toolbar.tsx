"use client";

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
}: BoardToolbarProps) {
  const { data: labelsData } = useQuery({
    queryKey: ["labels", boardId],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/boards/${boardId}/labels`, {
        cache: "no-store",
      });
      if (!res.ok) return { labels: [] };
      return res.json();
    },
  });

  const labels = labelsData?.labels ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Search cards..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="h-9 w-full sm:w-64"
      />

      <Select
        options={[{ value: "", label: "All Members" }]}
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
    </div>
  );
}

export { BoardToolbar };
