
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Checklist, ChecklistItem } from "@/types";

interface CardChecklistsProps {
  cardId: string;
}

function CardChecklists({ cardId }: CardChecklistsProps) {
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = React.useState("");

  const { data } = useQuery({
    queryKey: ["checklists", cardId],
    queryFn: async () => {
      const res = await fetch(`${""}/api/cards/${cardId}/checklists`, {credentials: "include", 
        cache: "no-store",
      });
      if (!res.ok) return { checklists: [] };
      return res.json();
    },
  });

  const checklists = data?.checklists ?? [];

  const createMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await fetch(`/api/cards/${cardId}/checklists`, {credentials: "include", 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to create checklist" }));
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklists", cardId] });
      setNewTitle("");
    },
  });

  const toggleItemMutation = useMutation({
    mutationFn: async ({ itemId, isComplete }: { itemId: string; isComplete: boolean }) => {
      const res = await fetch(`/api/checklist-items/${itemId}`, {credentials: "include", 
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isComplete: !isComplete }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to update item" }));
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklists", cardId] });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async ({ checklistId, title }: { checklistId: string; title: string }) => {
      const res = await fetch(`/api/checklists/${checklistId}/items`, {credentials: "include", 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to add item" }));
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklists", cardId] });
    },
  });

  const handleCreateChecklist = () => {
    if (newTitle.trim()) {
      createMutation.mutate(newTitle.trim());
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New checklist title"
          onKeyDown={(e) => e.key === "Enter" && handleCreateChecklist()}
        />
        <Button onClick={handleCreateChecklist} disabled={!newTitle.trim() || createMutation.isPending}>
          {createMutation.isPending ? "Adding..." : "Add"}
        </Button>
      </div>

      {checklists.length === 0 ? (
        <p className="text-sm text-muted-foreground">No checklists yet.</p>
      ) : (
        checklists.map((checklist: Checklist) => {
          const completed = checklist.items?.filter((i) => i.isCompleted).length ?? 0;
          const total = checklist.items?.length ?? 0;
          const progress = total > 0 ? (completed / total) * 100 : 0;

          return (
            <div key={checklist.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{checklist.title}</p>
                <span className="text-xs text-muted-foreground">
                  {completed}/{total}
                </span>
              </div>
              <Progress value={progress} />
              <div className="space-y-1 ml-4">
                {checklist.items?.map((item: ChecklistItem) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.isCompleted}
                      onChange={() => toggleItemMutation.mutate({ itemId: item.id, isComplete: item.isCompleted })}
                      className="rounded border-gray-300"
                    />
                    <span className={`text-sm ${item.isCompleted ? "line-through text-muted-foreground" : ""}`}>
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
              <AddChecklistItem checklistId={checklist.id} onAdd={addItemMutation.mutate} />
            </div>
          );
        })
      )}
    </div>
  );
}

function AddChecklistItem({ checklistId, onAdd }: { checklistId: string; onAdd: (data: { checklistId: string; title: string }) => void }) {
  const [title, setTitle] = React.useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onAdd({ checklistId, title: title.trim() });
      setTitle("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 ml-4 mt-1">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add item..."
        className="h-8 text-xs"
      />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        disabled={!title.trim()}
      >
        Add
      </Button>
    </form>
  );
}

export { CardChecklists };
