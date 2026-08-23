
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select } from "@/components/ui/select";
import { CardMembers } from "@/components/cards/card-members";
import { CardLabels } from "@/components/cards/card-labels";
import { CardChecklists } from "@/components/cards/card-checklists";
import { BoardCard, BoardColumn, ActivityEntry } from "@/types";

interface CardDetailModalProps {
  cardId: string;
  boardId: string;
  columns: BoardColumn[];
  onClose: () => void;
  onUpdate: () => void;
}

function CardDetailModal({ cardId, boardId, columns, onClose, onUpdate }: CardDetailModalProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [columnId, setColumnId] = React.useState("");

  const { data: cardData } = useQuery({
    queryKey: ["cards", cardId],
    queryFn: async () => {
      const res = await fetch(`${""}/api/cards/${cardId}`, {credentials: "include", 
        cache: "no-store",
      });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const card = cardData?.card as BoardCard | undefined;

  React.useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDescription(card.description ?? "");
      setDueDate(card.dueDate ? card.dueDate.split("T")[0] : "");
      setColumnId(card.columnId);
    }
  }, [card]);

  const updateMutation = useMutation({
    mutationFn: async (data: { title?: string; description?: string; dueDate?: string | null; columnId?: string }) => {
      const res = await fetch(`/api/cards/${cardId}`, {credentials: "include", 
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to update card" }));
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards", boardId] });
      queryClient.invalidateQueries({ queryKey: ["cards", cardId] });
      onUpdate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/cards/${cardId}`, {credentials: "include",  method: "DELETE" });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to delete card" }));
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      onUpdate();
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      title,
      description,
      dueDate: dueDate || null,
      columnId,
    });
  };

  if (!card) return null;

  return (
    <Dialog open={!!cardId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Card Details</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details">
          <TabsList className="mb-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="labels">Labels</TabsTrigger>
            <TabsTrigger value="checklists">Checklists</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Card title"
                  className="border-input data-[state=open]:border-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium mb-1">
                  Description
                </label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description..."
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="dueDate" className="block text-sm font-medium mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="border-input data-[state=open]:border-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  />
                </div>
                <div>
                  <label htmlFor="column" className="block text-sm font-medium mb-1">
                    Column
                  </label>
                  <Select
                    options={columns.map((c) => ({ value: c.id, label: c.name }))}
                    value={columnId}
                    onChange={(e) => setColumnId(e.target.value)}
                  />
                </div>
              </div>

              {updateMutation.isError && (
                <div className="p-3 text-sm text-destructive-foreground bg-destructive/10 border border-destructive rounded-md">
                  {updateMutation.error.message}
                </div>
              )}

              <div className="flex justify-between pt-4">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="members">
            <CardMembers cardId={cardId} boardId={boardId} />
          </TabsContent>

          <TabsContent value="labels">
            <CardLabels cardId={cardId} boardId={boardId} />
          </TabsContent>

          <TabsContent value="checklists">
            <CardChecklists cardId={cardId} />
          </TabsContent>

          <TabsContent value="activity">
            <ActivityLog cardId={cardId} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ActivityLog({ cardId }: { cardId: string }) {
  const { data } = useQuery({
    queryKey: ["activity", cardId],
    queryFn: async () => {
      const res = await fetch(`${""}/api/cards/${cardId}/activity`, {credentials: "include", 
        cache: "no-store",
      });
      if (!res.ok) return { activities: [] };
      return res.json();
    },
  });

  const activities = data?.activities ?? [];

  return (
    <div className="space-y-3">
      {activities.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        activities.map((activity: ActivityEntry) => (
          <div key={activity.id} className="flex items-start gap-2 text-sm">
            <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
            <div>
              <span className="font-medium">{activity.user?.displayName ?? "Someone"}</span>
              <span className="text-muted-foreground"> {activity.action}</span>
              <p className="text-xs text-muted-foreground">
                {new Date(activity.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export { CardDetailModal };
