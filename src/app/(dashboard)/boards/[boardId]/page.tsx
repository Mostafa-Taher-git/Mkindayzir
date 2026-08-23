"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { BoardDetailClient } from "./board-detail-client";

export default function BoardDetailPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const { user } = useAuth();

  const { data: boardData } = useQuery<{ board: any }>({
    queryKey: ["board", boardId],
    enabled: Boolean(boardId),
    queryFn: async () => {
      const res = await fetch(`/api/boards/${boardId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch board");
      return res.json();
    },
  });

  const { data: columnsData } = useQuery<{ columns: any[] }>({
    queryKey: ["board", boardId, "columns"],
    enabled: Boolean(boardId),
    queryFn: async () => {
      const res = await fetch(`/api/boards/${boardId}/columns`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch columns");
      return res.json();
    },
  });

  const { data: cardsData } = useQuery<{ cards: any[] }>({
    queryKey: ["board", boardId, "cards"],
    enabled: Boolean(boardId),
    queryFn: async () => {
      const res = await fetch(`/api/cards?boardId=${boardId}`, { credentials: "include" });
      if (!res.ok) return { cards: [] };
      return res.json();
    },
  });

  const board = boardData?.board;
  const columns = columnsData?.columns ?? [];
  const cards = cardsData?.cards ?? [];

  if (!board) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Board not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <BoardDetailClient board={board} columns={columns} cards={cards} currentUserId={user?.id ?? ""} />;
}
