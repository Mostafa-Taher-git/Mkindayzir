"use client";

import * as React from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import type { WorkItem } from "@/types/work-item";
import type { User } from "@/types/user";

const TYPE_COLORS: Record<string, string> = {
  TASK: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  BUG: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  FEATURE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  IMPROVEMENT: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  MEDIUM: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  LOW: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

interface WorkItemTableProps {
  items: WorkItem[];
  selectedIds: Set<string>;
  onSelectChange: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onRowClick?: (id: string) => void;
  projectKey: string;
}

function formatDate(date: string | null) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString();
}

function getInitials(user?: User) {
  if (!user) return "?";
  return user.displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function WorkItemTable({
  items,
  selectedIds,
  onSelectChange,
  onSelectAll,
  onRowClick,
  projectKey,
}: WorkItemTableProps) {
  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));
  const someSelected = items.some((i) => selectedIds.has(i.id)) && !allSelected;

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="w-10 px-3 py-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => onSelectAll(Boolean(checked))}
                aria-label="Select all"
              />
              {someSelected && (
                <span className="sr-only">Some selected</span>
              )}
            </th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">ID</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Title</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Priority</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Assignee</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Due Date</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-b hover:bg-accent/50 cursor-pointer transition-colors"
              onClick={() => onRowClick?.(item.id)}
            >
              <td className="px-3 py-2">
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={(checked) => {
                    onSelectChange(item.id, Boolean(checked));
                  }}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${projectKey}-${item.number}`}
                />
              </td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                {projectKey}-{item.number}
              </td>
              <td className="px-3 py-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                    TYPE_COLORS[item.type] || TYPE_COLORS.TASK
                  )}
                >
                  {item.type}
                </span>
              </td>
              <td className="px-3 py-2 max-w-[300px] truncate" title={item.title}>
                {item.title}
              </td>
              <td className="px-3 py-2">
                <Badge variant="secondary">{item.status}</Badge>
              </td>
              <td className="px-3 py-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.MEDIUM
                  )}
                >
                  {item.priority}
                </span>
              </td>
              <td className="px-3 py-2">
                {item.assignee ? (
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={item.assignee.avatar ?? ""} alt={item.assignee.displayName} />
                      <AvatarFallback className="text-xs">
                        {getInitials(item.assignee)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate max-w-[120px]">{item.assignee.displayName}</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{formatDate(item.dueDate)}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                No work items found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

export { WorkItemTable };
