"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ChecklistFormProps {
  cardId: string;
  onSuccess?: () => void;
}

function ChecklistForm({ cardId, onSuccess }: ChecklistFormProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");

  const mutation = useMutation({
    mutationFn: async (checklistTitle: string) => {
      const res = await fetch(`/api/cards/${cardId}/checklists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: checklistTitle }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to create checklist" }));
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklists", cardId] });
      setTitle("");
      onSuccess?.();
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      mutation.mutate(title.trim());
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Checklist</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Checklist title"
          />
          <Button type="submit" disabled={!title.trim() || mutation.isPending}>
            {mutation.isPending ? "Creating..." : "Create"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export { ChecklistForm };
