"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import type { Workflow } from "@/types/project";
import type { WorkItem } from "@/types/work-item";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BoardToolbar } from "@/components/boards/board-toolbar";
import { BoardTableView } from "@/components/boards/board-table-view";
import { KanbanBoard } from "@/components/boards/kanban-board";
import { Board, BoardColumn, BoardCard, BoardLabel } from "@/types";
import { ROUTES } from "@/lib/constants";
import { CardDetailModal } from "@/components/cards/card-detail-modal";
import Link from "next/link";

interface BoardDetailClientProps {
  board: Board;
  columns: BoardColumn[];
  cards: BoardCard[];
}

type WorkItemLike = WorkItem & { id: string };

type WorkItemLabel = {
  id: string;
  projectId: string;
  name: string;
  color: string;
  createdAt: string;
};

function mapBoardLabelToWorkItemLabel(label: BoardLabel): WorkItemLabel {
  return {
    id: label.id,
    projectId: "",
    name: label.name,
    color: label.color,
    createdAt: "",
  };
}

function mapCardToWorkItem(card: BoardCard, columnNameMap: Record<string, string>): WorkItemLike {
  const status = columnNameMap[card.columnId] ?? card.columnId;
  const firstMember = card.members?.[0];
  const assignee = firstMember?.user
    ? {
        id: firstMember.userId,
        email: "",
        displayName: firstMember.user.displayName,
        avatar: firstMember.user.avatar,
        role: "",
        status: "ACTIVE" as const,
      }
    : undefined;

  return {
    id: card.id,
    projectId: card.boardId,
    number: 0,
    type: "TASK",
    title: card.title,
    description: card.description,
    status,
    priority: "MEDIUM",
    assigneeId: firstMember?.userId ?? null,
    reporterId: "",
    initiativeId: null,
    iterationId: null,
    parentId: null,
    storyPoints: null,
    dueDate: card.dueDate,
    resolvedAt: null,
    metadata: card.metadata,
    position: card.position,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    deletedAt: null,
    project: undefined,
    assignee,
    initiative: undefined,
    iteration: undefined,
    labels: card.labels?.map((l) => ({ label: mapBoardLabelToWorkItemLabel(l.label!) })) ?? [],
  };
}

function BoardDetailClient({ board, columns: initialColumns, cards: initialCards }: BoardDetailClientProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [memberFilter, setMemberFilter] = React.useState("");
  const [labelFilter, setLabelFilter] = React.useState("");
  const [viewMode, setViewMode] = React.useState<"kanban" | "table">("kanban");
  const [activeCard, setActiveCard] = React.useState<BoardCard | null>(null);
  const [selectedCardId, setSelectedCardId] = React.useState<string | null>(null);

  const { data: columnsData } = useQuery({
    queryKey: ["columns", board.id],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/boards/${board.id}/columns`, {
        cache: "no-store",
      });
      if (!res.ok) return { columns: [] };
      return res.json();
    },
    initialData: { columns: initialColumns },
  });

  const { data: cardsData } = useQuery({
    queryKey: ["cards", board.id],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/cards?boardId=${board.id}`, {
        cache: "no-store",
      });
      if (!res.ok) return { cards: [] };
      return res.json();
    },
    initialData: { cards: initialCards },
  });

  const columns: BoardColumn[] = columnsData?.columns ?? initialColumns;
  const cards: BoardCard[] = cardsData?.cards ?? initialCards;

  const columnNameMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    columns.forEach((col: BoardColumn) => { map[col.id] = col.name; });
    return map;
  }, [columns]);

  const filteredCards = cards.filter((card: BoardCard) => {
    if (search && !card.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (memberFilter && !card.members?.some((m) => m.userId === memberFilter)) return false;
    if (labelFilter && !card.labels?.some((l) => l.labelId === labelFilter)) return false;
    return true;
  });

  const moveMutation = useMutation({
    mutationFn: async ({ cardId, columnId }: { cardId: string; columnId: string }) => {
      const res = await fetch(`/api/cards/${cardId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnId }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to move card" }));
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards", board.id] });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const workflow: Workflow = {
    id: board.id,
    projectId: board.spaceId,
    name: board.name,
    statuses: columns.map((c: BoardColumn) => c.name),
    transitions: {},
    isDefault: false,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };

  const mappedItems: WorkItemLike[] = filteredCards.map((card: BoardCard) => mapCardToWorkItem(card, columnNameMap));

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const card = cards.find((c: BoardCard) => c.id === active.id);
    setActiveCard(card ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCard(null);

    if (!over) return;

    const card = cards.find((c: BoardCard) => c.id === active.id);
    if (!card) return;

    const newColumnName = over.id as string;
    const targetColumn = columns.find((c: BoardColumn) => c.name === newColumnName);
    if (targetColumn && targetColumn.id !== card.columnId) {
      moveMutation.mutate({ cardId: card.id, columnId: targetColumn.id });
    }
  }

  const handleStatusChange = (itemId: string, newStatus: string) => {
    const targetColumn = columns.find((c: BoardColumn) => c.name === newStatus);
    if (targetColumn) {
      moveMutation.mutate({ cardId: itemId, columnId: targetColumn.id });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{board.name}</h1>
          </div>
          {board.description && (
            <p className="text-muted-foreground mt-1">{board.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`${ROUTES.SPACES}/${board.spaceId}`}>Back to Space</Link>
          </Button>
        </div>
      </div>

      <BoardToolbar
        boardId={board.id}
        search={search}
        onSearchChange={setSearch}
        viewMode={viewMode}
        onViewModeChange={(mode: string) => setViewMode(mode as "kanban" | "table")}
        memberFilter={memberFilter}
        onMemberFilterChange={setMemberFilter}
        labelFilter={labelFilter}
        onLabelFilterChange={setLabelFilter}
      />

      {viewMode === "kanban" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <KanbanBoard
            workflow={workflow}
            items={mappedItems}
            onItemClick={(id) => setSelectedCardId(id)}
            onStatusChange={handleStatusChange}
          />
          <DragOverlay>
            {activeCard ? (
              <div className="opacity-80 rotate-3 scale-105">
                <Card className="p-3 shadow-lg">
                  <p className="text-sm font-medium">{activeCard.title}</p>
                </Card>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <BoardTableView
          columns={columns}
          cards={filteredCards}
          onCardClick={(id) => setSelectedCardId(id)}
        />
      )}

      {selectedCardId && (
        <CardDetailModal
          cardId={selectedCardId}
          boardId={board.id}
          columns={columns}
          onClose={() => setSelectedCardId(null)}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ["cards", board.id] });
          }}
        />
      )}
    </div>
  );
}

export { BoardDetailClient };
