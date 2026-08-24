/**
 * AddCardComposer — "<IconPlus className="h-4 w-4 inline-block mr-1 -mt-0.5" /> Add a card" inline composer at the bottom of each
 * list, plus a "from template" picker that pre-fills the title/description.
 */
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { IconPlus, IconClose, IconTemplate } from "@/components/icons/grendizer";

export type CardTemplate = {
  id: string;
  label: string;
  title: string;
  description: string;
  coverColor?: string;
};

/** Built-in starter templates; boards can grow their own later. */
export const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: "bug",
    label: "🐞 Bug report",
    title: "[Bug] ",
    description:
      "**Steps to reproduce:**\n1. \n\n**Expected:**\n\n**Actual:**\n\n**Severity:** Minor / Major / Critical",
  },
  {
    id: "task",
    label: "✅ Task",
    title: "",
    description: "**Goal:**\n\n**Checklist:**\n- [ ] \n- [ ] ",
  },
  {
    id: "review",
    label: "🔍 Review request",
    title: "Review: ",
    description: "**What to review:**\n\n**Deadline:**\n\n**Context links:**",
    coverColor: "#0ea5e9",
  },
];

interface AddCardComposerProps {
  boardId: string;
  columnId: string;
}

export function AddCardComposer({ boardId, columnId }: AddCardComposerProps) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [coverColor, setCoverColor] = React.useState<string | undefined>();
  const [templateMenu, setTemplateMenu] = React.useState(false);
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/cards", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          columnId,
          title: title.trim(),
          description: description || undefined,
          coverColor,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || "Failed to create card");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards", boardId] });
      // Trello behaviour: composer stays open, title resets, focus returns.
      setTitle("");
      setDescription("");
      setCoverColor(undefined);
    },
  });

  const applyTemplate = (t: CardTemplate) => {
    setTitle(t.title);
    setDescription(t.description);
    setCoverColor(t.coverColor);
    setTemplateMenu(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <IconPlus className="h-4 w-4 inline-block mr-1 -mt-0.5" /> Add a card
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <textarea
        autoFocus
        rows={3}
        value={title}
        placeholder="Enter a title for this card…"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && title.trim()) {
            e.preventDefault();
            create.mutate();
          }
          if (e.key === "Escape") { setOpen(false); reset(); }
        }}
        className="w-full border-2 border-outline bg-background px-2 py-1.5 text-sm resize-none"
      />
      {description && (
        <div className="text-[11px] text-muted-foreground px-1">
          Template body will be attached ({description.length} chars)
        </div>
      )}
      <div className="flex items-center gap-2 relative">
        <Button
          size="sm"
          disabled={!title.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Adding…" : "Add card"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setTemplateMenu((v) => !v)}
          title="Create card from template"
        >
          <IconTemplate className="h-4 w-4 inline-block mr-1 -mt-0.5" /> Template ▾
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); reset(); }}>
          <IconClose className="h-4 w-4" />
        </Button>

        {templateMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setTemplateMenu(false)} />
            <div className="absolute bottom-full left-0 z-50 mb-1 w-52 border-2 border-outline bg-surface shadow-lg">
              <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-outline">
                Create from template
              </div>
              {CARD_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => applyTemplate(t)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );

  function reset() {
    setTitle("");
    setDescription("");
    setCoverColor(undefined);
    setTemplateMenu(false);
  }
}
