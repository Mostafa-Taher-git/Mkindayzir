
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BOARD_BACKGROUNDS } from "@/lib/constants";
import { Board } from "@/types";

type FormData = {
  name: string;
  description: string;
  background: string;
};

interface BoardFormProps {
  spaceId: string;
  board?: Board;
  onSuccess?: (board: { id: string }) => void;
}

function BoardForm({ spaceId, board, onSuccess }: BoardFormProps) {
  const queryClient = useQueryClient();

  const [form, setForm] = React.useState<FormData>({
    name: board?.name ?? "",
    description: board?.description ?? "",
    background: board?.background ?? "#ffffff",
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const url = board
        ? `/api/boards/${board.id}`
        : "/api/boards";
      const payload = board ? data : { ...data, spaceId };
      const res = await fetch(url, {
        method: board ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["boards"] });
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      onSuccess?.(data);
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
        <CardTitle>{board ? "Edit Board" : "Board Details"}</CardTitle>
        <CardDescription>
          {board ? "Update your board settings." : "Fill in the details below to create a new board."}
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
              placeholder="Enter board name"
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
              placeholder="Enter board description"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Background</label>
            <div className="flex gap-2 flex-wrap">
              {BOARD_BACKGROUNDS.map((bg) => (
                <button
                  key={bg.value}
                  type="button"
                  onClick={() => update("background", bg.value)}
                  className={cn(
                    "w-8 h-8 rounded-full border-2 transition-all",
                    form.background === bg.value ? "border-primary ring-2 ring-primary/20" : "border-transparent"
                  )}
                  style={{ backgroundColor: bg.value }}
                  title={bg.label}
                />
              ))}
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
              {mutation.isPending ? (board ? "Saving..." : "Creating...") : (board ? "Save Changes" : "Create Board")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

export { BoardForm };
