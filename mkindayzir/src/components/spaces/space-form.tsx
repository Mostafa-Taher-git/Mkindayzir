"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VISIBILITIES } from "@/lib/constants";
import { Space } from "@/types";

type FormData = {
  name: string;
  description: string;
  visibility: "PRIVATE" | "TEAM" | "PUBLIC";
};

interface SpaceFormProps {
  space?: Space;
  onSuccess?: () => void;
}

function SpaceForm({ space, onSuccess }: SpaceFormProps) {
  const queryClient = useQueryClient();

  const [form, setForm] = React.useState<FormData>({
    name: space?.name ?? "",
    description: space?.description ?? "",
    visibility: (space?.visibility as FormData["visibility"]) ?? "TEAM",
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const url = space
        ? `/api/spaces/${space.id}`
        : "/api/spaces";
      const res = await fetch(url, {
        method: space ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      onSuccess?.();
    },
  });

  const update = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const visibilityOptions = VISIBILITIES.map((v) => ({ value: v.value, label: v.label }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{space ? "Edit Space" : "Space Details"}</CardTitle>
        <CardDescription>
          {space ? "Update your space information below." : "Fill in the details below to create a new space."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          {mutation.isError && (
            <div className="p-3 text-sm text-destructive-foreground bg-destructive/10 border border-destructive rounded-md">
              {mutation.error.message}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              Name
            </label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Enter space name"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium mb-1">
              Description
            </label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Enter space description"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Visibility</label>
            <Select
              options={visibilityOptions}
              value={form.visibility}
              onChange={(e) => update("visibility", e.target.value as FormData["visibility"])}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => window.history.back()}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (space ? "Saving..." : "Creating...") : (space ? "Save Changes" : "Create Space")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export { SpaceForm };
