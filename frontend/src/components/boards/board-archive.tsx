/**
 * Board archive dialog: lists archived cards for this board and lets the
 * user restore any of them (back to the end of its original list).
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface BoardArchiveProps {
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function BoardArchive({ boardId, open, onOpenChange }: BoardArchiveProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["archived-cards", boardId],
    enabled: open,
    queryFn: async () => {
      const res = await fetch(`/api/cards/archived?boardId=${boardId}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return { cards: [] };
      return res.json();
    },
  });

  const restore = useMutation({
    mutationFn: async (cardId: string) => {
      const res = await fetch(`/api/cards/${cardId}/restore`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to restore card");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["archived-cards", boardId] });
      queryClient.invalidateQueries({ queryKey: ["cards", boardId] });
    },
  });

  const cards = data?.cards ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Archive</DialogTitle>
          <DialogDescription>
            Archived cards are kept here. Restoring puts a card back at the end of its original list.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-6 text-sm text-muted-foreground">Loading…</p>
        ) : cards.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No archived cards.</p>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {cards.map((c: { id: string; title: string }) => (
              <li key={c.id} className="flex items-center justify-between border border-outline bg-surface px-3 py-2">
                <span className="truncate text-sm">{c.title}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(c.id)}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { BoardArchive };
