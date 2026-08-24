/**
 * Trello-style kanban card face:
 *   cover stripe · complete circle · title · badges (desc/checklist/members)
 *   hover actions: edit (opens card) + archive · template banner
 */
import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CSS } from "@dnd-kit/utilities";

import type { WorkItem } from "@/types/work-item";

interface KanbanCardProps {
  item: WorkItem;
  onClick: () => void;
  /** boardId enables quick actions (archive/complete) */
  boardId?: string;
}

function KanbanCard({ item, onClick, boardId }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const queryClient = useQueryClient();
  const meta = (item as any).metadata ?? {};
  const isComplete = !!(item as any).isComplete;
  const isTemplate = !!(item as any).isTemplate;
  const coverColor = (item as any).coverColor as string | null | undefined;
  const description = item.description ?? "";
  const checklists = (item as any).checklists ?? [];
  const checklistTotal = checklists.reduce(
    (acc: number, cl: any) => acc + ((cl.items as any[]) ?? []).length, 0
  );
  const checklistDone = checklists.reduce(
    (acc: number, cl: any) => acc + (((cl.items as any[]) ?? []).filter((i: any) => i.isCompleted).length), 0
  );

  const refresh = () => {
    if (!boardId) return;
    queryClient.invalidateQueries({ queryKey: ["cards", boardId] });
  };

  const toggleComplete = useMutation({
    mutationFn: () =>
      fetch(`/api/cards/${item.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isComplete: !isComplete }),
      }),
    onSuccess: refresh,
  });

  const archive = useMutation({
    mutationFn: () =>
      fetch(`/api/cards/${item.id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: refresh,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, ...(coverColor ? { borderTop: `4px solid ${coverColor}` } : {}) }}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`group relative rounded-md border bg-card p-2.5 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${
        isComplete ? "opacity-80" : ""
      } ${isTemplate ? "border-primary/50" : "border-outline"}`}
    >
      {/* template banner */}
      {isTemplate && (
        <div className="mb-1.5 text-[10px] font-mono bg-primary/15 text-primary-light border border-primary/40 px-1.5 py-0.5 inline-block">
          📋 Template
        </div>
      )}

      {/* title row: complete circle + title */}
      <div className="flex items-start gap-2">
        <button
          aria-label={isComplete ? "Mark complete" : "Mark incomplete"}
          title={isComplete ? "Mark complete" : "Mark complete"}
          onClick={(e) => { e.stopPropagation(); toggleComplete.mutate(); }}
          className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center text-[9px] leading-none transition-colors ${
            isComplete ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/50 hover:border-emerald-400"
          }`}
        >
          {isComplete ? "✓" : ""}
        </button>
        <p className={`text-sm font-medium leading-snug break-words ${isComplete ? "line-through opacity-70" : ""}`}>
          {item.title}
        </p>
      </div>

      {/* badges row */}
      <div className="mt-1.5 flex items-center gap-2.5 text-[11px] text-muted-foreground">
        {description && <span title="This card has a description">≡</span>}
        {checklistTotal > 0 && (
          <span className={checklistDone === checklistTotal ? "text-emerald-500" : ""}>
            ☑ {checklistDone}/{checklistTotal}
          </span>
        )}
        {(item.assignee) && (
          <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/80 text-[9px] font-bold text-primary-foreground">
            {(item.assignee.displayName ?? "?").slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      {/* hover quick actions: edit / archive */}
      {boardId && (
        <div className="absolute right-1.5 top-1.5 hidden group-hover:flex items-center gap-1">
          <button
            aria-label="Edit card"
            title="Edit card (opens details)"
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className="h-6 w-6 rounded border border-outline bg-background/90 text-[11px] hover:border-primary"
          >
            ✎
          </button>
          <button
            aria-label="Archive card"
            title="Archive card"
            onClick={(e) => { e.stopPropagation(); archive.mutate(); }}
            className="h-6 w-6 rounded border border-outline bg-background/90 text-[11px] hover:border-destructive hover:text-destructive"
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
}

export { KanbanCard };
