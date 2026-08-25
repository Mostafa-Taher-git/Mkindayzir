/**
 * AddColumnButton — "+ Add another list" inline composer.
 */
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { IconPlus, IconClose } from "@/components/icons/grendizer";

export function AddColumnButton({ boardId }: { boardId: string }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/boards/${boardId}/columns`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to add list");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["columns", boardId] });
      setName("");
      // keep the composer open for rapid entry
    },
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-72 shrink-0 border-2 border-outline bg-surface/70 p-3 text-left text-sm font-medium text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
      >
        <IconPlus className="h-4 w-4 inline-block mr-1 -mt-0.5" /> Add another list
      </button>
    );
  }

  return (
    <div className="w-72 shrink-0 border-2 border-outline bg-surface p-2 space-y-2">
      <input
        autoFocus
        value={name}
        placeholder="Enter list name…"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) create.mutate();
          if (e.key === "Escape") { setOpen(false); setName(""); }
        }}
        className="w-full border-2 border-outline bg-background px-2 py-1.5 text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
          Add list
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setName(""); }}>
          <IconClose className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
