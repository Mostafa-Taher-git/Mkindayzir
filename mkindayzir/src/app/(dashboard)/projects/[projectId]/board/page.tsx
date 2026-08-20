"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KanbanBoard } from "@/components/boards/kanban-board";
import { ROUTES } from "@/lib/constants";
import type { WorkItem } from "@/types/work-item";
import type { Workflow } from "@/types/project";

function BoardPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const queryClient = useQueryClient();
  const [selectedItemId, setSelectedItemId] = React.useState<string | null>(null);

  const { data: workflowData } = useQuery({
    queryKey: ["projects", projectId, "workflows"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/workflows`);
      if (!res.ok) return { workflows: [] };
      const json = await res.json();
      return json as { workflows: Workflow[] };
    },
  });

  const { data: itemsData, isLoading } = useQuery({
    queryKey: ["projects", projectId, "work-items"],
    queryFn: async () => {
      const res = await fetch(`/api/work-items?projectId=${projectId}`);
      if (!res.ok) return { workItems: [] };
      const json = await res.json();
      return json as { workItems: WorkItem[] };
    },
  });

  const transitionMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      const res = await fetch(`/api/work-items/${itemId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to transition");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "work-items"] });
    },
  });

  const workflow = workflowData?.workflows?.[0];
  const items = itemsData?.workItems ?? [];

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center text-muted-foreground">Loading board...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Board</h1>
        <Button asChild>
          <Link href={`${ROUTES.PROJECTS}/${projectId}/work-items/new`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 mr-1"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
            New Work Item
          </Link>
        </Button>
      </div>

      {!workflow ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">No workflow configured for this project.</p>
          </CardContent>
        </Card>
      ) : (
        <KanbanBoard
          workflow={workflow}
          items={items}
          onItemClick={(id) => setSelectedItemId(id)}
          onStatusChange={(itemId, newStatus) => {
            transitionMutation.mutate({ itemId, status: newStatus });
          }}
        />
      )}

      <Dialog open={Boolean(selectedItemId)} onOpenChange={(open) => !open && setSelectedItemId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Work Item Detail</DialogTitle>
          </DialogHeader>
          {selectedItemId && (
            <div className="space-y-2">
              {(() => {
                const item = items.find((i) => i.id === selectedItemId);
                if (!item) return <p className="text-muted-foreground">Item not found</p>;
                return (
                  <>
                    <p className="font-medium">{item.title}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{item.type}</span>
                      <span className="text-xs text-muted-foreground">{item.status}</span>
                      <span className="text-xs text-muted-foreground">{item.priority}</span>
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    )}
                    <Button asChild variant="ghost" className="mt-2">
                      <Link href={`/dashboard/work-items/${item.id}`}>View Details</Link>
                    </Button>
                  </>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BoardPage;
