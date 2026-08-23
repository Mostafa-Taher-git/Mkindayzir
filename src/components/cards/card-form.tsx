
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { BoardCard, BoardColumn } from "@/types";

type FormData = {
  title: string;
  description: string;
  columnId: string;
  dueDate: string;
};

interface CardFormProps {
  boardId: string;
  columns: BoardColumn[];
  card?: BoardCard;
  onSuccess?: () => void;
}

function CardForm({ boardId, columns, card, onSuccess }: CardFormProps) {
  const queryClient = useQueryClient();

  const [form, setForm] = React.useState<FormData>({
    title: card?.title ?? "",
    description: card?.description ?? "",
    columnId: card?.columnId ?? columns[0]?.id ?? "",
    dueDate: card?.dueDate ? card.dueDate.split("T")[0] : "",
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const url = card ? `/api/cards/${card.id}` : "/api/cards";
      const payload = card
        ? data
        : { ...data, dueDate: data.dueDate || null };
      const res = await fetch(url, {
        method: card ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards", boardId] });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{card ? "Edit Card" : "New Card"}</CardTitle>
        <CardDescription>
          {card ? "Update card details below." : "Create a new card on this board."}
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
            <label htmlFor="title" className="block text-sm font-medium mb-1">
              Title
            </label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="Enter card title"
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
              placeholder="Enter card description"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="column" className="block text-sm font-medium mb-1">
                Column
              </label>
              <Select
                options={columns.map((c) => ({ value: c.id, label: c.name }))}
                value={form.columnId}
                onChange={(e) => update("columnId", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="dueDate" className="block text-sm font-medium mb-1">
                Due Date
              </label>
              <Input
                id="dueDate"
                type="date"
                value={form.dueDate}
                onChange={(e) => update("dueDate", e.target.value)}
              />
            </div>
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
              {mutation.isPending ? (card ? "Saving..." : "Creating...") : (card ? "Save Changes" : "Create Card")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export { CardForm };
