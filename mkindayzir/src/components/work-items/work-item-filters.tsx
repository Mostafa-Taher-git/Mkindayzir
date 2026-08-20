"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { User } from "@/types/user";

interface WorkItemFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  status?: string;
  onStatusChange: (value: string) => void;
  type?: string;
  onTypeChange: (value: string) => void;
  priority?: string;
  onPriorityChange: (value: string) => void;
  assignee?: string;
  onAssigneeChange: (value: string) => void;
  iteration?: string;
  onIterationChange: (value: string) => void;
  statuses: Array<{ value: string; label: string }>;
  types: Array<{ value: string; label: string }>;
  priorities: Array<{ value: string; label: string }>;
  assignees: User[];
  iterations: Array<{ id: string; name: string }>;
}

function WorkItemFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  type,
  onTypeChange,
  priority,
  onPriorityChange,
  assignee,
  onAssigneeChange,
  iteration,
  onIterationChange,
  statuses,
  types,
  priorities,
  assignees,
  iterations,
}: WorkItemFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        <Input
          placeholder="Search work items..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
      <Select
        options={[{ value: "all", label: "All Statuses" }, ...statuses]}
        value={status}
        onChange={(e) => onStatusChange(e.target.value)}
      />
      <Select
        options={[{ value: "all", label: "All Types" }, ...types]}
        value={type}
        onChange={(e) => onTypeChange(e.target.value)}
      />
      <Select
        options={[{ value: "all", label: "All Priorities" }, ...priorities]}
        value={priority}
        onChange={(e) => onPriorityChange(e.target.value)}
      />
      <Select
        options={[{ value: "all", label: "All Assignees" }, ...assignees.map((a) => ({ value: a.id, label: a.displayName }))]}
        value={assignee ?? "all"}
        onChange={(e) => onAssigneeChange(e.target.value)}
      />
      <Select
        options={[{ value: "all", label: "All Iterations" }, { value: "none", label: "Unassigned" }, ...iterations.map((it) => ({ value: it.id, label: it.name }))]}
        value={iteration ?? "all"}
        onChange={(e) => onIterationChange(e.target.value)}
      />
    </div>
  );
}

export { WorkItemFilters };
