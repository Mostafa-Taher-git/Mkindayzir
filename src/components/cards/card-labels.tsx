"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

interface CardLabelsProps {
  cardId: string;
  boardId: string;
}

function CardLabels({ cardId, boardId }: CardLabelsProps) {
  const queryClient = useQueryClient();
  const [labelId, setLabelId] = React.useState("");

  const { data } = useQuery({
    queryKey: ["card-labels", cardId],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/cards/${cardId}/labels`, {
        cache: "no-store",
      });
      if (!res.ok) return { labels: [] };
      return res.json();
    },
  });

  const { data: boardLabelsData } = useQuery({
    queryKey: ["labels", boardId],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/boards/${boardId}/labels`, {
        cache: "no-store",
      });
      if (!res.ok) return { labels: [] };
      return res.json();
    },
  });

  const labels = data?.labels ?? [];
  const boardLabels = boardLabelsData?.labels ?? [];

  const addMutation = useMutation({
    mutationFn: async (lid: string) => {
      const res = await fetch(`/api/cards/${cardId}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelId: lid }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to add label" }));
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["card-labels", cardId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (lid: string) => {
      const res = await fetch(`/api/cards/${cardId}/labels/${lid}`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to remove label" }));
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["card-labels", cardId] });
    },
  });

  const handleAdd = () => {
    if (labelId) {
      addMutation.mutate(labelId);
      setLabelId("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select
          value={labelId}
          onChange={(e) => setLabelId(e.target.value)}
          className="border-input data-[state=open]:border-ring flex h-9 flex-1 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="">Select label...</option>
          {boardLabels.map((label: { id: string; name: string; color: string }) => (
            <option key={label.id} value={label.id}>{label.name}</option>
          ))}
        </select>
        <Button onClick={handleAdd} disabled={!labelId || addMutation.isPending}>
          {addMutation.isPending ? "Adding..." : "Add"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {labels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No labels assigned.</p>
        ) : (
          labels.map((item: { id: string; label?: { name: string; color: string } }) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: item.label?.color ?? "#e5e7eb", color: "#000" }}
            >
              {item.label?.name}
              <button
                onClick={() => removeMutation.mutate(item.id)}
                className="ml-1 hover:opacity-70"
              >
                x
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

export { CardLabels };
