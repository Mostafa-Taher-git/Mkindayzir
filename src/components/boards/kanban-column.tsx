
import * as React from "react";
import {
  useDroppable,
} from "@dnd-kit/core";

import { Card } from "@/components/ui/card";
import type { WorkItem } from "@/types/work-item";
import { KanbanCard } from "./kanban-card";

interface KanbanColumnProps {
  id: string;
  title: string;
  items: WorkItem[];
  onItemClick: (id: string) => void;
}

function KanbanColumn({ id, title, items, onItemClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex flex-col w-72 shrink-0">
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>
      <Card
        ref={setNodeRef}
        className={cn(
          "flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]",
          isOver && "ring-2 ring-primary/50 bg-accent/20"
        )}
      >
        {items.map((item) => (
          <KanbanCard key={item.id} item={item} onClick={() => onItemClick(item.id)} />
        ))}
        {items.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-4">
            No items
          </div>
        )}
      </Card>
    </div>
  );
}

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

export { KanbanColumn };
