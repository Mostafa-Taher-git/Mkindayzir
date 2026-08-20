"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { ROUTES } from "@/lib/constants";
import { ITERATION_STATUSES } from "@/lib/constants";
import type { Iteration, IterationStats } from "@/types/iteration";

function IterationsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["projects", projectId, "iterations"],
    queryFn: async () => {
      const res = await fetch(`/api/iterations?projectId=${projectId}`);
      if (!res.ok) return { iterations: [] };
      const json = await res.json();
      return json as { iterations: Iteration[] };
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; goal?: string; startDate?: string; endDate?: string }) => {
      const res = await fetch("/api/iterations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, projectId }),
      });
      if (!res.ok) throw new Error("Failed to create iteration");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "iterations"] });
      setIsCreateOpen(false);
    },
  });

  const startMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/iterations/${id}/start`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to start iteration");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "iterations"] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/iterations/${id}/complete`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to complete iteration");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "iterations"] });
    },
  });

  const iterations = data?.iterations ?? [];

  const getStats = (iteration: Iteration): IterationStats => {
    const workItems = iteration.workItems ?? [];
    const total = workItems.length;
    const completed = workItems.filter((wi) => wi.status === "DONE").length;
    const points = workItems.reduce((sum, wi) => sum + ((wi as unknown as { storyPoints?: number }).storyPoints ?? 0), 0);
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, points, progress };
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Iterations</h1>
          <p className="text-muted-foreground mt-1">
            Plan and track iterations for this project
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 mr-1"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
              New Iteration
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Iteration</DialogTitle>
            </DialogHeader>
            <CreateIterationForm
              onSubmit={(data) => createMutation.mutate(data)}
              isSubmitting={createMutation.isPending}
              onCancel={() => setIsCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground">Loading...</div>
      ) : iterations.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center">
              No iterations yet. Create your first iteration to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {iterations.map((iteration) => {
            const stats = getStats(iteration);
            return (
              <Card key={iteration.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{iteration.name}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {iteration.goal || "No goal specified"}
                      </CardDescription>
                    </div>
                    <span className="text-xs text-muted-foreground capitalize bg-muted px-2 py-1 rounded-full">
                      {iteration.status.toLowerCase()}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{stats.progress}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${stats.progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{stats.total} items</span>
                    <span>{stats.completed} completed</span>
                    <span>{stats.points} pts</span>
                  </div>
                  <div className="flex gap-2">
                    {(iteration.status === "PLANNING" || iteration.status === "ACTIVE") && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => startMutation.mutate(iteration.id)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 mr-1"><polygon points="6 3 20 12 6 21 6 3" /></svg>
                        Start
                      </Button>
                    )}
                    {iteration.status === "ACTIVE" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => completeMutation.mutate(iteration.id)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 mr-1"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                        Complete
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface CreateIterationFormProps {
  onSubmit: (data: { name: string; goal?: string; startDate?: string; endDate?: string }) => void;
  isSubmitting: boolean;
  onCancel: () => void;
}

function CreateIterationForm({ onSubmit, isSubmitting, onCancel }: CreateIterationFormProps) {
  const [name, setName] = React.useState("");
  const [goal, setGoal] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      goal: goal || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-1">
          Name
        </label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="goal" className="block text-sm font-medium mb-1">
          Goal
        </label>
        <Textarea id="goal" value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="startDate" className="block text-sm font-medium mb-1">
            Start Date
          </label>
          <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="endDate" className="block text-sm font-medium mb-1">
            End Date
          </label>
          <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create"}
        </Button>
      </div>
    </form>
  );
}

export default IterationsPage;
