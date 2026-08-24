
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useDroppable,
} from "@dnd-kit/core";

import { Card } from "@/components/ui/card";
import type { WorkItem } from "@/types/work-item";
import { KanbanCard } from "./kanban-card";

import { AddCardComposer } from "./add-card-composer";

interface KanbanColumnProps {
  id: string;
  title: string;
  items: WorkItem[];
  onItemClick: (id: string) => void;
  boardId?: string; // when set, shows the add-card composer + list menu
  onRenamed?: (newName: string) => void;
}

function KanbanColumn({ id, title, items, onItemClick, boardId, onRenamed }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [nameValue, setNameValue] = React.useState(title);
  const queryClient = useQueryClient();

  // NOTE: the board page maps columns by NAME (workflow.statuses), so a rename
  // must flow through the parent to re-key the droppable. We call onRenamed
  // which PATCHes the column and invalidates the columns query.
  const rename = useMutation({
    mutationFn: async () => {
      // find the real column id by name via the columns cache
      const cache = queryClient.getQueryData<any>(["columns", boardId]);
      const list = cache?.columns ?? [];
      const col = list.find((c: any) => c.name === title);
      if (!col) throw new Error("column not found");
      const res = await fetch(`/api/boards/${boardId}/columns/${col.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameValue.trim() }),
      });
      if (!res.ok) throw new Error("rename failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["columns", boardId] });
      onRenamed?.(nameValue.trim());
      setRenaming(false);
    },
  });

  const deleteList = useMutation({
    mutationFn: async () => {
      const cache = queryClient.getQueryData<any>(["columns", boardId]);
      const list = cache?.columns ?? [];
      const col = list.find((c: any) => c.name === title);
      if (!col) throw new Error("column not found");
      const res = await fetch(`/api/boards/${boardId}/columns/${col.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("delete failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["columns", boardId] });
      queryClient.invalidateQueries({ queryKey: ["cards", boardId] });
      setMenuOpen(false);
    },
  });

  return (
    <div className="flex flex-col w-72 shrink-0">
      {/* ---- list header: name · count · actions menu ---- */}
      <div className="flex items-center justify-between mb-2 px-1">
        {renaming ? (
          <input
            autoFocus
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={() => { if (nameValue.trim() && nameValue !== title) rename.mutate(); else setRenaming(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setRenaming(false);
            }}
            className="flex-1 mr-2 border-2 border-primary bg-background px-2 py-0.5 text-sm font-semibold"
          />
        ) : (
          <h3
            className="text-sm font-semibold cursor-text hover:bg-accent px-1 rounded truncate"
            title="Click to rename list"
            onClick={() => { setNameValue(title); setRenaming(true); }}
          >
            {title}
          </h3>
        )}
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full" title="Total cards">
          {items.length}
        </span>

        {/* "..." list actions */}
        {boardId && (
          <div className="relative ml-1">
            <button
              aria-label="List actions"
              title="List actions"
              onClick={() => setMenuOpen((v) => !v)}
              className="h-6 w-6 rounded hover:bg-accent text-muted-foreground hover:text-foreground text-xs tracking-widest"
            >
              ⋯
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-48 border-2 border-outline bg-surface shadow-lg">
                  <button
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => { setMenuOpen(false); setRenaming(true); }}
                  >
                    ✎ Rename list
                  </button>
                  <button
                    className="block w-full px-3 py-2 text-left text-sm text-destructive hover:bg-accent"
                    onClick={() => {
                      if (window.confirm(`Delete list "${title}" and its ${items.length} card(s)?`)) {
                        deleteList.mutate();
                      }
                    }}
                  >
                    🗑 Delete list
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <Card
        ref={setNodeRef}
        className={cn(
          // solid surface so lists stay readable over photo backgrounds
          "flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-260px)] bg-surface border-outline",
          isOver && "ring-2 ring-primary/50"
        )}
      >
        {items.map((item) => (
          <KanbanCard key={item.id} item={item} onClick={() => onItemClick(item.id)} boardId={boardId} />
        ))}
        {items.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-4">
            No cards yet
          </div>
        )}
        {boardId && <AddCardComposer boardId={boardId} columnId={id} />}
      </Card>
    </div>
  );
}

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

export { KanbanColumn };
