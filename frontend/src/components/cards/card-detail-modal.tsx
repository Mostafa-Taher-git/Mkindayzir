/**
 * CardDetailModal — card view.
 *
 * Layout: full-width dialog, left = title + complete toggle + action buttons +
 * description; right = Comments & activity feed.
 * Header: list-name dropdown (move), Cover, "..." menu (Copy / Make template /
 * Watch / Archive), close.
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CardMembers } from "@/components/cards/card-members";
import { CardLabels } from "@/components/cards/card-labels";
import { CardChecklists } from "@/components/cards/card-checklists";
import { BoardCard, BoardColumn } from "@/types";
import { IconMore, IconClose, IconCheck, IconLabel, IconClock, IconChecklist, IconMember, IconComment, IconTemplate, IconTrash } from "@/components/icons/grendizer";

interface CardDetailModalProps {
  cardId: string;
  boardId: string;
  columns: BoardColumn[];
  onClose: () => void;
  onUpdate: () => void;
}

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store", ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err?.error?.message || err?.message || "Request failed");
  }
  return res.json();
}

type Section = "labels" | "dates" | "checklist" | "members" | null;

export function CardDetailModal({ cardId, boardId, columns, onClose, onUpdate }: CardDetailModalProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [section, setSection] = React.useState<Section>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [listMenuOpen, setListMenuOpen] = React.useState(false);
  const [commentText, setCommentText] = React.useState("");

  const { data: cardData } = useQuery({
    queryKey: ["cards", cardId],
    queryFn: () => jfetch<{ card: BoardCard }>(`/api/cards/${cardId}`),
  });
  const card = cardData?.card;

  const commentsQ = useQuery({
    queryKey: ["comments", cardId],
    queryFn: () => jfetch<{ comments: any[] }>(`/api/cards/${cardId}/comments`),
  });

  React.useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDescription(card.description ?? "");
      setDueDate(card.dueDate ? card.dueDate.split("T")[0] : "");
    }
  }, [card]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["cards", boardId] });
    queryClient.invalidateQueries({ queryKey: ["cards", cardId] });
    queryClient.invalidateQueries({ queryKey: ["comments", cardId] });
    onUpdate();
  };

  const update = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      jfetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: refresh,
  });

  const addComment = useMutation({
    mutationFn: () =>
      jfetch(`/api/cards/${cardId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText }),
      }),
    onSuccess: () => { setCommentText(""); refresh(); },
  });

  const deleteComment = useMutation({
    mutationFn: (id: string) => jfetch(`/api/cards/${cardId}/comments/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });

  const cardAction = useMutation({
    mutationFn: ({ verb, body }: { verb: string; body?: any }) =>
      jfetch(`/api/cards/${cardId}/${verb}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      }),
    onSuccess: (_d, vars) => {
      setMenuOpen(false);
      if (vars.verb === "copy") {
        refresh();
      }
      refresh();
    },
  });

  const archive = useMutation({
    mutationFn: () => jfetch(`/api/cards/${cardId}`, { method: "DELETE" }),
    onSuccess: () => { refresh(); onClose(); },
  });

  const columnName = columns.find((c) => c.id === card?.columnId)?.name ?? "";
  const checklists = (card as any)?.checklists ?? [];

  const toggleComplete = () => update.mutate({ isComplete: !card?.isComplete });

  const saveOnBlur = () => {
    if (card && title.trim() && title !== card.title) update.mutate({ title: title.trim() });
    if (card && description !== (card.description ?? "")) update.mutate({ description });
  };

  if (!card) return null;

  return (
    <Dialog open={!!cardId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        {/* ---- header: list dropdown · cover · menu · close ---- */}
        <div className="flex items-center justify-between -mt-2">
          <div className="relative">
            <button
              className="px-2 py-1 border-2 border-outline bg-surface text-xs font-mono uppercase hover:border-primary"
              onClick={() => setListMenuOpen((v) => !v)}
              title="Move to another list"
            >
              {columnName || "list"} ▾
            </button>
            {listMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setListMenuOpen(false)} />
                <div className="absolute left-0 top-full z-50 mt-1 w-56 border-2 border-outline bg-surface shadow-lg max-h-64 overflow-y-auto">
                  <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-outline">Move card to</div>
                  {columns.map((c) => (
                    <button
                      key={c.id}
                      className={`block w-full px-3 py-2 text-left text-sm hover:bg-accent ${c.id === card.columnId ? "bg-primary/10 font-semibold" : ""}`}
                      onClick={async () => {
                        setListMenuOpen(false);
                        if (c.id !== card.columnId) {
                          await cardAction.mutateAsync({ verb: "move", body: { columnId: c.id } });
                        }
                      }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Cover color quick-set */}
            <div className="relative group">
              <Button variant="ghost" size="icon" title="Cover" onClick={() => setSection(section === null ? "labels" : null)}>
                🖼
              </Button>
              <div className="absolute right-0 top-full z-50 hidden group-hover:flex gap-1 border-2 border-outline bg-surface p-2 shadow-lg">
                {["#bb152c", "#0ea5e9", "#10b981", "#f59e0b", "#a855f7", "#64748b"].map((col) => (
                  <button
                    key={col}
                    aria-label={`cover ${col}`}
                    className={`h-6 w-6 border ${card.coverColor === col ? "border-primary ring-2 ring-primary/40" : "border-transparent"}`}
                    style={{ backgroundColor: col }}
                    onClick={async () => { await update.mutateAsync({ coverColor: col }); }}
                  />
                ))}
                <button
                  aria-label="remove cover"
                  className="h-6 w-6 border border-outline text-xs"
                  onClick={async () => { await update.mutateAsync({ coverColor: null }); }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* "..." menu */}
            <div className="relative">
              <Button variant="ghost" size="icon" onClick={() => setMenuOpen((v) => !v)}><IconMore className="h-4 w-4" /></Button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-56 border-2 border-outline bg-surface shadow-lg">
                    {[
                      { label: "Copy", act: () => cardAction.mutate({ verb: "copy" }) },
                      { label: card.isTemplate ? "Remove template" : "Make template", act: () => update.mutate({ isTemplate: !card.isTemplate }) },
                      { label: "Move…", act: () => { setMenuOpen(false); setListMenuOpen(true); } },
                      { label: card.isComplete ? "Mark incomplete" : "Mark complete", act: toggleComplete },
                    ].map((item) => (
                      <button
                        key={item.label}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => { setMenuOpen(false); item.act(); }}
                      >
                        {item.label}
                      </button>
                    ))}
                    <div className="border-t border-outline" />
                    <button
                      className="block w-full px-3 py-2 text-left text-sm text-destructive hover:bg-accent"
                      onClick={() => { setMenuOpen(false); archive.mutate(); }}
                    >
                      Archive
                    </button>
                  </div>
                </>
              )}
            </div>

            <Button variant="ghost" size="icon" onClick={onClose}><IconClose className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* ---- title + complete ---- */}
        <div className="flex items-start gap-3 mt-2">
          <button
            aria-label={card.isComplete ? "Mark incomplete" : "Mark complete"}
            title={card.isComplete ? "Mark incomplete" : "Mark complete"}
            onClick={toggleComplete}
            className={`mt-1 h-6 w-6 shrink-0 rounded-full border-2 flex items-center justify-center text-sm transition-colors ${
              card.isComplete
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-muted-foreground/60 hover:border-primary"
            }`}
          >
            {card.isComplete && <IconCheck className="h-3.5 w-3.5" />}
          </button>
          <div className="flex-1">
            {card.isTemplate && (
              <div className="mb-2 text-xs font-mono bg-primary/15 text-primary-light border border-primary/40 px-2 py-1 inline-block">
                <IconTemplate className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" /> This card is a template.
              </div>
            )}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveOnBlur}
              onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
              className={`w-full bg-transparent text-2xl font-bold focus:outline-none focus:bg-background/60 px-1 rounded ${
                card.isComplete ? "line-through opacity-70" : ""
              }`}
            />
            <div className="text-xs text-muted-foreground mt-1">
              in list <span className="font-semibold">{columnName}</span>
              {card.dueDate && <> · due {new Date(card.dueDate).toLocaleDateString()}</>}
            </div>
          </div>
        </div>

        {/* ---- action buttons row ---- */}
        <div className="flex flex-wrap gap-2 mt-4 relative">
          <Button size="sm" variant="outline" onClick={() => setSection(section === "labels" ? null : "labels")}><IconLabel className="h-4 w-4 inline-block mr-1 -mt-0.5" /> Labels</Button>
          <Button size="sm" variant="outline" onClick={() => setSection(section === "dates" ? null : "dates")}><IconClock className="h-4 w-4 inline-block mr-1 -mt-0.5" /> Dates</Button>
          <Button size="sm" variant="outline" onClick={() => setSection(section === "checklist" ? null : "checklist")}><IconChecklist className="h-4 w-4 inline-block mr-1 -mt-0.5" /> Checklist</Button>
          <Button size="sm" variant="outline" onClick={() => setSection(section === "members" ? null : "members")}><IconMember className="h-4 w-4 inline-block mr-1 -mt-0.5" /> Members</Button>

          {section === "labels" && (
            <div className="absolute top-full left-0 z-30 mt-1 w-80 border-2 border-outline bg-surface shadow-lg p-2">
              <CardLabels cardId={cardId} boardId={boardId} />
            </div>
          )}
          {section === "dates" && (
            <div className="absolute top-full left-0 z-30 mt-1 w-72 border-2 border-outline bg-surface shadow-lg p-3 space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Due date</div>
              <input
                type="date"
                value={dueDate}
                onChange={async (e) => { setDueDate(e.target.value); await update.mutateAsync({ dueDate: e.target.value || null }); }}
                className="w-full border-2 border-outline bg-background px-2 py-1.5 text-sm"
              />
              {card.dueDate && (
                <Button size="sm" variant="ghost" onClick={async () => { setDueDate(""); await update.mutateAsync({ dueDate: null }); }}>
                  Remove due date
                </Button>
              )}
            </div>
          )}
          {section === "checklist" && (
            <div className="absolute top-full left-0 z-30 mt-1 w-96 max-w-full border-2 border-outline bg-surface shadow-lg p-2">
              <CardChecklists cardId={cardId} />
            </div>
          )}
          {section === "members" && (
            <div className="absolute top-full left-0 z-30 mt-1 w-80 border-2 border-outline bg-surface shadow-lg p-2">
              <CardMembers cardId={cardId} boardId={boardId} />
            </div>
          )}
        </div>

        {/* ---- two-column body ---- */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">
          {/* left: description + inline editors */}
          <div className="lg:col-span-3 space-y-4">
            <div>
              <div className="text-sm font-semibold mb-1 flex items-center gap-2">Description</div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={saveOnBlur}
                placeholder="Add a more detailed description…"
                rows={6}
                className="w-full border-2 border-outline bg-background px-3 py-2 text-sm resize-y"
              />
            </div>

            {(checklists.length ?? 0) > 0 && (
              <div className="border-2 border-outline bg-surface p-3">
                <CardChecklists cardId={cardId} />
              </div>
            )}
          </div>

          {/* right: comments & activity */}
          <div className="lg:col-span-2 border-l-2 border-outline lg:pl-4">
            <div className="text-sm font-semibold mb-2 flex items-center gap-2"><IconComment className="h-4 w-4 inline-block mr-1 -mt-0.5" /> Comments and activity</div>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write a comment…"
              rows={3}
              className="w-full border-2 border-outline bg-background px-3 py-2 text-sm resize-none"
            />
            <div className="flex justify-end mt-1">
              <Button size="sm" disabled={!commentText.trim() || addComment.isPending} onClick={() => addComment.mutate()}>
                {addComment.isPending ? "Sending…" : "Comment"}
              </Button>
            </div>

            <div className="mt-4 space-y-3 max-h-72 overflow-y-auto pr-1">
              {(commentsQ.data?.comments ?? []).map((cm: any) => (
                <div key={cm.id} className="group flex items-start gap-2">
                  <div className="h-7 w-7 shrink-0 rounded-full bg-primary/80 text-primary-foreground flex items-center justify-center text-[10px] font-bold">
                    {(cm.author?.displayName ?? "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs">
                      <span className="font-semibold">{cm.author?.displayName ?? "Unknown"}</span>{" "}
                      <span className="text-muted-foreground">
                        {new Date(cm.createdAt!).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="text-sm whitespace-pre-wrap break-words">{cm.content}</div>
                  </div>
                  {(cm.author?.id === card.createdById || true) && (
                    <button
                      className="opacity-0 group-hover:opacity-100 text-xs text-muted-foreground hover:text-destructive"
                      title="Delete comment"
                      onClick={() => deleteComment.mutate(cm.id)}
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {(commentsQ.data?.comments ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No comments yet.</p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
