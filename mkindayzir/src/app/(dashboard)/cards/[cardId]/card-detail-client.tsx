"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CardMembers } from "@/components/cards/card-members";
import { CardLabels } from "@/components/cards/card-labels";
import { CardChecklists } from "@/components/cards/card-checklists";
import { BoardCard } from "@/types";
import { ROUTES } from "@/lib/constants";
import Link from "next/link";

interface CardDetailClientProps {
  card: BoardCard;
}

function CardDetailClient({ card }: CardDetailClientProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState(card.title);
  const [description, setDescription] = React.useState(card.description ?? "");

  const { data: checklistsData } = useQuery({
    queryKey: ["checklists", card.id],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/cards/${card.id}/checklists`, {
        cache: "no-store",
      });
      if (!res.ok) return { checklists: [] };
      return res.json();
    },
  });

  const checklists = checklistsData?.checklists ?? [];

  const totalItems = checklists.reduce((sum: number, cl: { items?: Array<{ isCompleted: boolean }> }) => sum + (cl.items?.length ?? 0), 0);
  const completedItems = checklists.reduce((sum: number, cl: { items?: Array<{ isCompleted: boolean }> }) => sum + (cl.items?.filter((i: { isCompleted: boolean }) => i.isCompleted).length ?? 0), 0);
  const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  const updateMutation = useMutation({
    mutationFn: async (data: { title?: string; description?: string }) => {
      const res = await fetch(`/api/cards/${card.id}`, {
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
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      queryClient.invalidateQueries({ queryKey: ["checklists", card.id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/cards/${card.id}`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to delete card" }));
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      window.location.href = ROUTES.BOARDS;
    },
  });

  const handleUpdate = () => {
    updateMutation.mutate({ title, description });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{card.title}</h1>
          {card.description && (
            <p className="text-muted-foreground mt-1">{card.description}</p>
          )}
          <div className="flex items-center gap-2 mt-3">
            {card.dueDate && (
              <Badge variant="outline">
                Due: {new Date(card.dueDate).toLocaleDateString()}
              </Badge>
            )}
            {card.column && (
              <Badge variant="secondary">{card.column.name}</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={ROUTES.BOARDS}>Back to Boards</Link>
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (confirm("Are you sure you want to delete this card?")) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
          >
            Delete
          </Button>
        </div>
      </div>

      {totalItems > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Progress value={progress} className="flex-1" />
              <span className="text-sm text-muted-foreground">
                {completedItems}/{totalItems}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="labels">Labels</TabsTrigger>
          <TabsTrigger value="checklists">Checklists</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="border-input data-[state=open]:border-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="border-input data-[state=open]:border-ring flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <CardMembers cardId={card.id} boardId={card.boardId} />
        </TabsContent>

        <TabsContent value="labels">
          <CardLabels cardId={card.id} boardId={card.boardId} />
        </TabsContent>

        <TabsContent value="checklists">
          <CardChecklists cardId={card.id} />
        </TabsContent>

        <TabsContent value="activity">
          <ActivityLog cardId={card.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ActivityLog({ cardId }: { cardId: string }) {
  const { data } = useQuery({
    queryKey: ["activity", cardId],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/cards/${cardId}/activity`, {
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
        activities.map((activity: { id: string; user?: { displayName: string }; action: string; createdAt: string }) => (
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

export { CardDetailClient };
