"use client";

import * as React from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import type { WorkItem } from "@/types/work-item";
import type { Workflow } from "@/types/project";

interface KanbanBoardProps {
  workflow: Workflow;
  items: WorkItem[];
  onItemClick: (id: string) => void;
  onStatusChange: (itemId: string, newStatus: string) => void;
}

function KanbanBoard({ workflow, items, onItemClick, onStatusChange }: KanbanBoardProps) {
  const [activeItem, setActiveItem] = React.useState<WorkItem | null>(null);
  const columns = workflow.statuses;

  const getItemsForStatus = (status: string) =>
    items.filter((item) => item.status === status);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const item = items.find((i) => i.id === active.id);
    setActiveItem(item ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveItem(null);

    if (!over) return;

    const item = items.find((i) => i.id === active.id);
    if (!item) return;

    const newStatus = over.id as string;
    if (newStatus && newStatus !== item.status) {
      onStatusChange(item.id, newStatus);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((status) => (
          <KanbanColumn
            key={status}
            id={status}
            title={status}
            items={getItemsForStatus(status)}
            onItemClick={onItemClick}
          />
        ))}
      </div>
      <DragOverlay>
        {activeItem ? (
          <div className="opacity-80 rotate-3 scale-105">
            <KanbanCard item={activeItem} onClick={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export { KanbanBoard };
