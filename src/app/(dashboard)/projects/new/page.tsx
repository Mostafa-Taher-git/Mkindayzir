"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";

const VISIBILITY_OPTIONS = [
  { value: "PRIVATE", label: "Private" },
  { value: "TEAM", label: "Team" },
  { value: "PUBLIC", label: "Public" },
];

type FormData = {
  key: string;
  name: string;
  description: string;
  visibility: "PRIVATE" | "TEAM" | "PUBLIC";
};

function NewProjectPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [form, setForm] = React.useState<FormData>({
    key: "",
    name: "",
    description: "",
    visibility: "TEAM",
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to create project" }));
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      router.push(ROUTES.PROJECTS);
    },
  });

  const update = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">New Project</h1>
        <p className="text-muted-foreground mt-1">
          Create a new project to organize your work
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Project Details</CardTitle>
          <CardDescription>Fill in the details below to create a new project.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {mutation.isError && (
              <div className="border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive-foreground">
                {mutation.error.message}
              </div>
            )}

            <div>
              <label htmlFor="key" className="block text-sm font-medium mb-1">
                Key
              </label>
              <Input
                id="key"
                value={form.key}
                onChange={(e) => update("key", e.target.value.toUpperCase())}
                placeholder="e.g. PROJ"
                maxLength={10}
              />
              <p className="text-xs text-muted-foreground mt-1">
                2-10 uppercase letters or numbers
              </p>
            </div>

            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-1">
                Name
              </label>
              <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Enter project name" />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium mb-1">
                Description
              </label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="Enter project description"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Visibility</label>
              <Select
                options={VISIBILITY_OPTIONS}
                value={form.visibility}
                onChange={(e) => update("visibility", e.target.value as FormData["visibility"])}
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
                {mutation.isPending ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default NewProjectPage;
