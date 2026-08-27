/**
 * Kanban card face:
 *   cover stripe · complete square · title · label chips ·
 *   badges (desc/checklist/comments/due/members) · hover actions: edit+archive · template banner
 */
import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "react-router-dom";

import type { WorkItem } from "@/types/work-item";
import { IconEdit, IconArchive, IconTemplate } from "@/components/icons/grendizer";
import { useToast } from "@/components/ui/toast";

interface KanbanCardProps {
  item: WorkItem;
  onClick: () => void;
  /** boardId enables quick actions (archive/complete) */
  boardId?: string;
}

function KanbanCard({ item, onClick, boardId }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const queryClient = useQueryClient();
  const isComplete = !!(item as any).isComplete;
  const isTemplate = !!(item as any).isTemplate;
  const coverColor = (item as any).coverColor as string | null | undefined;
  const description = item.description ?? "";
  const labels = ((item as any).labels ?? []) as { id: string; name: string; color: string }[];
  const checklistTotal = (item as any).checklistTotal ?? 0;
  const checklistDone = (item as any).checklistDone ?? 0;
  const commentCount = (item as any).commentCount ?? 0;
  const dueDate = (item as any).dueDate as string | null | undefined;
  const members = ((item as any).members ?? []) as { id: string; displayName: string | null }[];

  const dueInfo = React.useMemo(() => {
    if (!dueDate) return null;
    const d = new Date(dueDate);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    const overdue = d.getTime() < now.getTime() && !isComplete;
    return {
      overdue,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    };
  }, [dueDate, isComplete]);

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

  const { toast } = useToast();

  const archiveCard = useMutation({
    mutationFn: () =>
      fetch(`/api/cards/${item.id}/archive`, { method: "POST", credentials: "include" })
        .then(async (r) => { if (!r.ok) throw new Error("Archive failed"); return r.json(); }),
    onSuccess: () => {
      refresh();
      toast({
        title: "Card archived",
        description: `${item.title} is now in the Vault.`,
        action: (
          <Link to="/vault" className="text-xs underline">
            Open Vault
          </Link>
        ),
      });
    },
    onError: (e) => toast({ title: "Archive failed", description: String(e) }),
  });

  function confirmArchive(e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm(`Archive "${item.title}"?\n\nIt will be moved to the Vault. You can restore it from there.`)) return;
    archiveCard.mutate();
  }

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
      className={`group relative border-2 bg-card p-2.5 cursor-pointer transition-shadow hover:shadow-[0_2px_0_0_var(--color-border-strong)] ${
        isComplete ? "opacity-80" : ""
      } ${isTemplate ? "border-primary/60" : "border-outline"}`}
    >
      {/* template banner */}
      {isTemplate && (
        <div className="mb-1.5 text-[10px] font-mono bg-primary/15 text-primary-light border border-primary/40 px-1.5 py-0.5 inline-block">
          <IconTemplate className="h-3 w-3 inline-block mr-1 -mt-0.5" /> Template
        </div>
      )}

      {/* label chips */}
      {labels.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {labels.map((l) => (
            <span
              key={l.id}
              title={l.name}
              className="inline-block h-2 w-8 rounded-[2px]"
              style={{ backgroundColor: l.color }}
            />
          ))}
        </div>
      )}

      {/* title row: complete square + title */}
      <div className="flex items-start gap-2">
        <button
          aria-label={isComplete ? "Mark incomplete" : "Mark complete"}
          onClick={(e) => { e.stopPropagation(); toggleComplete.mutate(); }}
          className={`mt-0.5 h-4 w-4 shrink-0 border-2 flex items-center justify-center text-[9px] leading-none transition-colors ${
            isComplete
              ? "border-success bg-success text-background"
              : "border-muted-foreground/50 hover:border-success"
          }`}
        >
          {isComplete ? "✓" : ""}
        </button>
        <p className={`text-sm font-medium leading-snug break-words ${isComplete ? "line-through opacity-70" : ""}`}>
          {item.title}
        </p>
      </div>

      {/* badges row */}
      <div className="mt-1.5 flex items-center gap-2.5 text-[11px] font-mono text-muted-foreground">
        {description && <span title="This card has a description">≡</span>}
        {checklistTotal > 0 && (
          <span className={checklistDone === checklistTotal ? "text-success" : ""}>
            ☑ {checklistDone}/{checklistTotal}
          </span>
        )}
        {commentCount > 0 && <span title={`${commentCount} comments`}>💬 {commentCount}</span>}
        {dueInfo && (
          <span className={dueInfo.overdue ? "font-bold text-critical" : ""}>
            🕐 {dueInfo.label}
          </span>
        )}
        {members.length > 0 && (
          <span className="ml-auto flex -space-x-1.5">
            {members.slice(0, 3).map((m) => (
              <span
                key={m.id}
                title={m.displayName ?? ""}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/80 text-[9px] font-bold text-primary-foreground ring-1 ring-card"
              >
                {(m.displayName ?? "?").slice(0, 2).toUpperCase()}
              </span>
            ))}
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
            className="h-6 w-6 border border-outline bg-background/90 text-[11px] hover:border-primary"
          >
            <IconEdit className="h-3.5 w-3.5" />
          </button>
          <button
            aria-label="Archive card"
            title="Archive card (moves to Vault)"
            onClick={confirmArchive}
            className="h-6 w-6 border border-outline bg-background/90 text-[11px] hover:border-critical hover:text-critical"
          >
            <IconArchive className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export { KanbanCard };
