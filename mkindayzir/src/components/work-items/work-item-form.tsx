"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type { WorkItem } from "@/types/work-item";
import type { User } from "@/types/user";
import type { Iteration } from "@/types/iteration";
import type { Initiative } from "@/types/initiative";

interface WorkItemFormProps {
  projectId: string;
  item?: WorkItem;
  onSuccess?: () => void;
  assignees?: User[];
  iterations?: Iteration[];
  initiatives?: Initiative[];
}

function WorkItemForm({
  projectId,
  item,
  onSuccess,
  assignees = [],
  iterations = [],
  initiatives = [],
}: WorkItemFormProps) {
  const queryClient = useQueryClient();
  const isEditing = Boolean(item);

  const [title, setTitle] = React.useState(item?.title ?? "");
  const [description, setDescription] = React.useState(item?.description ?? "");
  const [type, setType] = React.useState(item?.type ?? "TASK");
  const [priority, setPriority] = React.useState(item?.priority ?? "MEDIUM");
  const [status, setStatus] = React.useState(item?.status ?? "");
  const [assigneeId, setAssigneeId] = React.useState(item?.assigneeId ?? null);
  const [initiativeId, setInitiativeId] = React.useState(item?.initiativeId ?? null);
  const [iterationId, setIterationId] = React.useState(item?.iterationId ?? null);
  const [dueDate, setDueDate] = React.useState(item?.dueDate ? new Date(item.dueDate).toISOString().split("T")[0] : "");
  const [storyPoints, setStoryPoints] = React.useState<number | null>(item?.storyPoints ?? null);

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        projectId,
        title,
        description: description || null,
        type,
        priority,
        status,
        assigneeId: assigneeId,
        initiativeId: initiativeId,
        iterationId: iterationId,
        dueDate: dueDate || null,
        storyPoints,
      };

      if (isEditing && item) {
        const res = await fetch(`/api/work-items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Failed to update work item");
        return res.json();
      }

      const res = await fetch(`/api/work-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to create work item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "work-items"] });
      queryClient.invalidateQueries({ queryKey: ["work-items"] });
      onSuccess?.();
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="title" className="block text-sm font-medium mb-1">
          Title
        </label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter work item title" />
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
            options={[
              { value: "TASK", label: "Task" },
              { value: "BUG", label: "Bug" },
              { value: "FEATURE", label: "Feature" },
              { value: "IMPROVEMENT", label: "Improvement" },
            ]}
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Priority</label>
          <Select
            options={[
              { value: "CRITICAL", label: "Critical" },
              { value: "HIGH", label: "High" },
              { value: "MEDIUM", label: "Medium" },
              { value: "LOW", label: "Low" },
            ]}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Assignee</label>
          <Select
            options={[{ value: "", label: "Unassigned" }, ...assignees.map((a) => ({ value: a.id, label: a.displayName }))]}
            value={assigneeId ?? ""}
            onChange={(e) => setAssigneeId(e.target.value || null)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Iteration</label>
          <Select
            options={[{ value: "", label: "None" }, ...iterations.map((it) => ({ value: it.id, label: it.name }))]}
            value={iterationId ?? ""}
            onChange={(e) => setIterationId(e.target.value || null)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Initiative</label>
          <Select
            options={[{ value: "", label: "None" }, ...initiatives.map((init) => ({ value: init.id, label: init.name }))]}
            value={initiativeId ?? ""}
            onChange={(e) => setInitiativeId(e.target.value || null)}
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

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onSuccess}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving..." : isEditing ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}

export { WorkItemForm };
