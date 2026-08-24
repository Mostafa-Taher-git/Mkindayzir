import { Link } from "react-router-dom";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
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
import { BoardHeader } from "@/components/boards/board-header";
import { AddColumnButton } from "@/components/boards/add-column-button";
import { AddCardComposer } from "@/components/boards/add-card-composer";
import { BackgroundPicker } from "@/components/boards/background-picker";
import { BoardTableView } from "@/components/boards/board-table-view";
import { KanbanBoard } from "@/components/boards/kanban-board";
import { Board, BoardColumn, BoardCard, BoardLabel } from "@/types";
import { ROUTES } from "@/lib/constants";
import { CardDetailModal } from "@/components/cards/card-detail-modal";
import { usePresence } from "@/hooks/use-presence";
import { PresenceIndicator } from "@/components/shared/presence-indicator";

interface BoardDetailClientProps {
  board: Board;
  columns: BoardColumn[];
  cards: BoardCard[];
  currentUserId: string;
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

function mapCardToWorkItem(card: BoardCard, _columnNameMap: Record<string, string>): WorkItemLike {
  // status is the column ID — KanbanBoard keys lists by id now.
  const status = card.columnId;
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


function BoardPresence({ boardId }: { boardId: string }) {
  const { user } = useAuth();
  const { presentUsers } = usePresence("board", boardId);
  if (!user?.id) return null;
  return <PresenceIndicator users={presentUsers} currentUserId={user.id} />;
}

function BoardDetailClient({ board: boardProp, columns: initialColumns, cards: initialCards }: BoardDetailClientProps) {
  const queryClient = useQueryClient();

  // Live board record (starred flag / visibility may change while viewing).
  const boardQ = useQuery({
    queryKey: ["board", boardProp.id],
    queryFn: async () => {
      const res = await fetch(`/api/boards/${boardProp.id}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) return { board: boardProp };
      return res.json();
    },
    initialData: { board: boardProp },
  });
  const board = (boardQ.data?.board ?? boardProp) as typeof boardProp;
  const [search, setSearch] = React.useState("");
  const [memberFilter, setMemberFilter] = React.useState("");
  const [labelFilter, setLabelFilter] = React.useState("");
  const [viewMode, setViewMode] = React.useState<"kanban" | "table">("kanban");
  const [activeCard, setActiveCard] = React.useState<BoardCard | null>(null);
  const [selectedCardId, setSelectedCardId] = React.useState<string | null>(null);

  const { data: columnsData } = useQuery({
    queryKey: ["columns", board.id],
    queryFn: async () => {
      const res = await fetch(`${""}/api/boards/${board.id}/columns`, {credentials: "include", 
        cache: "no-store",
      });
      if (!res.ok) return { columns: [] };
      const data = await res.json();
      // tolerate both {columns:[...]} (current) and bare [...] (legacy)
      return { columns: Array.isArray(data) ? data : data.columns ?? [] };
    },
    initialData: { columns: initialColumns },
  });

  const { data: cardsData } = useQuery({
    queryKey: ["cards", board.id],
    queryFn: async () => {
      const res = await fetch(`${""}/api/cards?boardId=${board.id}`, {credentials: "include", 
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
      const res = await fetch(`/api/cards/${cardId}/move`, {credentials: "include", 
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
    // Key kanban columns by column ID (stable across renames). The card->WorkItem
    // mapper below resolves the display name separately.
    statuses: columns.map((c: BoardColumn) => c.id),
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

  // ---- background (color or image + fine overlay) ----
  const settings = (typeof board.settings === "string"
    ? safeParse(board.settings)
    : board.settings) as { bgImageUrl?: string | null; bgOverlay?: number; bgColor?: string | null } | undefined;
  const bgImage = settings?.bgImageUrl || null;
  const bgOverlay = typeof settings?.bgOverlay === "number" ? settings.bgOverlay : 0.45;
  const bgColor = settings?.bgColor || board.background || "#0b1622";

  return (
    <div className="relative min-h-screen">
      {/* Layer 1 — photo */}
      {bgImage && (
        <div
          className="fixed inset-0 -z-20 bg-cover bg-center"
          style={{ backgroundImage: `url(${bgImage})` }}
        />
      )}
      {/* Layer 2 — fine dark overlay so text/cards stay legible */}
      {bgImage && (
        <div className="fixed inset-0 -z-10" style={{ backgroundColor: `rgba(4,10,18,${bgOverlay})` }} />
      )}
      {/* Fallback tint when no photo */}
      {!bgImage && (
        <div className="fixed inset-0 -z-30" style={{ backgroundColor: bgColor }} />
      )}

      {/* Content column on translucent panels */}
      <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BoardHeader board={board} onBoardChanged={() => {
          queryClient.invalidateQueries({ queryKey: ["board", board.id] });
        }} />
        <BackgroundPicker
          boardId={board.id}
          value={{
            color: bgColor,
            imageUrl: bgImage,
            overlay: bgOverlay,
          }}
        />
      </div>
      <div className="flex items-center justify-between rounded-md bg-background/70 backdrop-blur-sm px-3 py-1.5 border border-outline/40">
        <div className="text-sm text-muted-foreground flex items-center gap-3">
          {board.description && <span>{board.description}</span>}
          <BoardPresence boardId={board.id} />
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/workspace">Back to Workspace</Link>
        </Button>
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
            boardId={board.id}
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

      <div className="mt-2">
        <AddColumnButton boardId={board.id} />
      </div>

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
    </div>
  );
}

function safeParse(raw: string): any {
  try { const v = JSON.parse(raw); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

export { BoardDetailClient };
