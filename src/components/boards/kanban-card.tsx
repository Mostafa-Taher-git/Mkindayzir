"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { WorkItem } from "@/types/work-item";

const TYPE_COLORS: Record<string, string> = {
  TASK: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  BUG: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  FEATURE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  IMPROVEMENT: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "border-l-red-500",
  HIGH: "border-l-orange-500",
  MEDIUM: "border-l-yellow-500",
  LOW: "border-l-gray-400",
};

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  TASK: WrenchIcon,
  BUG: BugIcon,
  FEATURE: LightbulbIcon,
  IMPROVEMENT: FileTextIcon,
};

interface KanbanCardProps {
  item: WorkItem;
  onClick: () => void;
}

function KanbanCard({ item, onClick }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const TypeIcon = TYPE_ICONS[item.type] || WrenchIcon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "border-l-4 rounded-md border bg-card p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow",
        PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.MEDIUM,
        isDragging && "opacity-50"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            TYPE_COLORS[item.type] || TYPE_COLORS.TASK
          )}
        >
          <TypeIcon className="h-3 w-3" />
          {item.type}
        </span>
        <span className="text-xs text-muted-foreground">
          {item.project?.key}-{item.number}
        </span>
      </div>
      <p className="text-sm font-medium line-clamp-2 mb-2">{item.title}</p>
      <div className="flex items-center justify-between">
        {item.assignee ? (
          <Avatar className="h-6 w-6">
            <AvatarImage src={item.assignee.avatar ?? ""} alt={item.assignee.displayName} />
            <AvatarFallback className="text-xs">
              {item.assignee.displayName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div />
        )}
        <Badge variant="secondary" className="text-xs">
          {item.priority}
        </Badge>
      </div>
    </div>
  );
}

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

export { KanbanCard };

function WrenchIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
  );
}

function BugIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 20a4 4 0 0 0 4-4V8a4 4 0 0 0-4-4 4 4 0 0 0-4 4v8a4 4 0 0 0 4 4Z" /><path d="M12 4V1" /><path d="M12 23v-3" /><path d="M4 12H1" /><path d="M23 12h-3" /></svg>
  );
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></svg>
  );
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></svg>
  );
}
