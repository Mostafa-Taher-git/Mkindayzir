/**
 * "Move to board" popover: pick any board + one of its columns, then move
 * the card there. Labels tied to the old board's palette are dropped;
 * members and checklists travel with the card.
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";

interface MoveToBoardProps {
  cardId: string;
  currentBoardId: string;
  onDone?: () => void;
}

function MoveToBoard({ cardId, currentBoardId, onDone }: MoveToBoardProps) {
  const queryClient = useQueryClient();
  const [boardId, setBoardId] = React.useState("");
  const [columnId, setColumnId] = React.useState("");

  const { data: boardsData } = useQuery({
    queryKey: ["boards-all"],
    enabled: true,
    queryFn: async () => {
      const res = await fetch("/api/boards/", { credentials: "include", cache: "no-store" });
      if (!res.ok) return { boards: [] };
      return res.json();
    },
  });

  const { data: colsData } = useQuery({
    queryKey: ["columns", boardId],
    enabled: Boolean(boardId),
    queryFn: async () => {
      const res = await fetch(`/api/boards/${boardId}/columns`, { credentials: "include", cache: "no-store" });
      if (!res.ok) return { columns: [] };
      const d = await res.json();
      return { columns: Array.isArray(d) ? d : d.columns ?? [] };
    },
  });

  const boards = (boardsData?.boards ?? []).filter((b: { id: string }) => b.id !== currentBoardId);

  const move = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/cards/${cardId}/move-board`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnId }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: { message: "Move failed" } }));
        throw new Error(error.error?.message ?? "Move failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      onDone?.();
    },
  });

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Target board</div>
      <select
        value={boardId}
        onChange={(e) => { setBoardId(e.target.value); setColumnId(""); }}
        className="w-full border-2 border-outline bg-background px-2 py-1.5 text-sm"
      >
        <option value="">Choose a board…</option>
        {boards.map((b: { id: string; name: string }) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>

      {boardId && (
        <>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Target list</div>
          <select
            value={columnId}
            onChange={(e) => setColumnId(e.target.value)}
            className="w-full border-2 border-outline bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Choose a list…</option>
            {(colsData?.columns ?? []).map((c: { id: string; name: string }) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </>
      )}

      {move.isError && <p className="text-xs text-critical">{(move.error as Error).message}</p>}

      <Button size="sm" disabled={!columnId || move.isPending} onClick={() => move.mutate()}>
        {move.isPending ? "Moving…" : "Move"}
      </Button>
    </div>
  );
}

export { MoveToBoard };
