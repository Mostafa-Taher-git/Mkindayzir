"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { WORK_ITEM_TYPES, PRIORITIES } from "@/lib/constants";
import type { User } from "@/types/user";
import type { Iteration } from "@/types/iteration";
import type { Initiative } from "@/types/initiative";

const FORM_TYPES = WORK_ITEM_TYPES as unknown as Array<{ value: string; label: string }>;
const FORM_PRIORITIES = PRIORITIES as unknown as Array<{ value: string; label: string }>;

function NewWorkItemPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const queryClient = useQueryClient();

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState("TASK");
  const [priority, setPriority] = React.useState("MEDIUM");
  const [assigneeId, setAssigneeId] = React.useState<string>("");
  const [initiativeId, setInitiativeId] = React.useState<string>("");
  const [iterationId, setIterationId] = React.useState<string>("");
  const [dueDate, setDueDate] = React.useState("");
  const [storyPoints, setStoryPoints] = React.useState<number | null>(null);

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return { users: [] };
      const json = await res.json();
      return json as { users: User[] };
    },
  });

  const { data: iterationsData } = useQuery({
    queryKey: ["projects", projectId, "iterations"],
    queryFn: async () => {
      const res = await fetch(`/api/iterations?projectId=${projectId}`);
      if (!res.ok) return { iterations: [] };
      const json = await res.json();
      return json as { iterations: Iteration[] };
    },
    enabled: Boolean(projectId),
  });

  const { data: initiativesData } = useQuery({
    queryKey: ["projects", projectId, "initiatives"],
    queryFn: async () => {
      const res = await fetch(`/api/initiatives?projectId=${projectId}`);
      if (!res.ok) return { initiatives: [] };
      const json = await res.json();
      return json as { initiatives: Initiative[] };
    },
    enabled: Boolean(projectId),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        projectId,
        title,
        description: description || null,
        type,
        priority,
        assigneeId: assigneeId || null,
        initiativeId: initiativeId || null,
        iterationId: iterationId || null,
        dueDate: dueDate || null,
        storyPoints,
      };
      const res = await fetch("/api/work-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to create work item" }));
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "work-items"] });
      router.push(`${ROUTES.PROJECTS}/${projectId}/work-items`);
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    mutation.mutate();
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">New Work Item</h1>
        <p className="text-muted-foreground mt-1">
          Create a new work item for this project
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Work Item Details</CardTitle>
          <CardDescription>Fill in the details below.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {mutation.isError && (
              <div className="border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive-foreground">
                {mutation.error.message}
              </div>
            )}

            <div>
              <label htmlFor="title" className="block text-sm font-medium mb-1">
                Title
              </label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter work item title" required />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium mb-1">
                Description
              </label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter description"
                rows={4}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <Select
                  options={FORM_TYPES}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Priority</label>
                <Select
                  options={FORM_PRIORITIES}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Assignee</label>
                <Select
                  options={[
                    { value: "", label: "Unassigned" },
                    ...(usersData?.users ?? []).map((a) => ({ value: a.id, label: a.displayName })),
                  ]}
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Iteration</label>
                <Select
                  options={[
                    { value: "", label: "None" },
                    ...(iterationsData?.iterations ?? []).map((it) => ({ value: it.id, label: it.name })),
                  ]}
                  value={iterationId}
                  onChange={(e) => setIterationId(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Initiative</label>
                <Select
                  options={[
                    { value: "", label: "None" },
                    ...(initiativesData?.initiatives ?? []).map((init) => ({ value: init.id, label: init.name })),
                  ]}
                  value={initiativeId}
                  onChange={(e) => setInitiativeId(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="dueDate" className="block text-sm font-medium mb-1">
                  Due Date
                </label>
                <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>

            <div>
              <label htmlFor="storyPoints" className="block text-sm font-medium mb-1">
                Story Points
              </label>
              <Input
                id="storyPoints"
                type="number"
                value={storyPoints ?? ""}
                onChange={(e) => setStoryPoints(e.target.value ? Number(e.target.value) : null)}
                placeholder="Optional"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Creating..." : "Create Work Item"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default NewWorkItemPage;
