/**
 * BoardHeader — board chrome.
 *
 * Star/unstar · rename · visibility switcher · share (copy link + members) ·
 * switch-between-boards dropdown · background picker.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconStar, IconShare, IconDuplicate, IconSwitch, IconVisibility } from "@/components/icons/grendizer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type BoardHeaderBoard = {
  id: string;
  spaceId: string;
  name: string;
  description?: string | null;
  background?: string | null;
  visibility?: string;
  starred?: boolean;
  spaceName?: string | null;
};

const VISIBILITIES = [
  { value: "PRIVATE", label: "Private", hint: "Only space members can see this board." },
  { value: "WORKSPACE", label: "Workspace", hint: "Everyone in this workspace can view." },
  { value: "PUBLIC", label: "Public", hint: "Anyone with the link can view." },
];

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store", ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err?.error?.message || err?.message || "Request failed");
  }
  return res.json();
}

interface BoardHeaderProps {
  board: BoardHeaderBoard;
  onBoardChanged?: () => void;
}

export function BoardHeader({ board, onBoardChanged }: BoardHeaderProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState(board.name);
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const boardsQ = useQuery({
    queryKey: ["boards"],
    queryFn: () => jfetch<{ boards: BoardHeaderBoard[] }>("/api/boards"),
  });
  const allBoards = (boardsQ.data?.boards ?? []).filter((b) => b.spaceId === board.spaceId);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["board", board.id] });
    queryClient.invalidateQueries({ queryKey: ["boards"] });
    onBoardChanged?.();
  };

  const toggleStar = useMutation({
    mutationFn: (starred: boolean) =>
      jfetch(`/api/boards/${board.id}/star`, { method: starred ? "POST" : "DELETE" }),
    onSuccess: refresh,
  });

  const patchBoard = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      jfetch(`/api/boards/${board.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: refresh,
  });

  const shareLink = `${window.location.origin}/boards/${board.id}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const visibilityMeta =
    VISIBILITIES.find((v) => v.value === (board.visibility || "WORKSPACE")) ?? VISIBILITIES[1];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Switch board */}
      <div className="relative">
        <Button variant="outline" size="sm" onClick={() => setSwitcherOpen((v) => !v)}>
          <IconSwitch className="h-4 w-4 inline-block mr-1 -mt-0.5" /> Switch board
        </Button>
        {switcherOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setSwitcherOpen(false)} />
            <div className="absolute left-0 top-full z-50 mt-1 w-72 border-2 border-outline bg-surface shadow-lg max-h-80 overflow-y-auto">
              <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-outline">
                Boards in this space
              </div>
              {allBoards.map((b) => (
                <button
                  key={b.id}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent ${
                    b.id === board.id ? "bg-primary/10 font-semibold" : ""
                  }`}
                  onClick={() => {
                    setSwitcherOpen(false);
                    if (b.id !== board.id) navigate(`/boards/${b.id}`);
                  }}
                >
                  <span
                    className="inline-block h-5 w-5 shrink-0 border border-outline"
                    style={{ backgroundColor: b.background || "#1f2937" }}
                  />
                  <span className="truncate">{b.starred ? "★ " : ""}{b.name}</span>
                </button>
              ))}
              {allBoards.length === 0 && (
                <div className="px-3 py-3 text-sm text-muted-foreground">No other boards</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Visibility badge + menu */}
      <div className="relative">
        <Button variant="outline" size="sm" title={visibilityMeta.hint} onClick={(e) => {
          const el = e.currentTarget.nextElementSibling as HTMLElement | null;
          if (el) el.style.display = el.style.display === "block" ? "none" : "block";
        }}>
          <IconVisibility className="h-4 w-4 inline-block mr-1 -mt-0.5" /> {visibilityMeta.label}
        </Button>
        <div className="hidden absolute left-0 top-full z-50 mt-1 w-64 border-2 border-outline bg-surface shadow-lg">
          <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-outline">
            Set visibility
          </div>
          {VISIBILITIES.map((v) => (
            <button
              key={v.value}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-accent ${
                v.value === board.visibility ? "font-semibold bg-primary/10" : ""
              }`}
              onClick={async (e) => {
                const menu = e.currentTarget.parentElement as HTMLElement;
                menu.style.display = "none";
                await patchBoard.mutateAsync({ visibility: v.value });
              }}
            >
              <span className="block">{v.label}</span>
              <span className="block text-xs text-muted-foreground">{v.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Share */}
      <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
        <IconShare className="h-4 w-4 inline-block mr-1 -mt-0.5" /> Share
      </Button>

      {/* Duplicate (template) */}
      <Button
        variant="outline"
        size="sm"
        title="Create a copy of this board with all lists and cards — use it as a template"
        onClick={async () => {
          const name = window.prompt("New board name:", `${board.name} (copy)`);
          if (!name) return;
          try {
            const data = await jfetch<{ board: { id: string } }>(`/api/boards/${board.id}/duplicate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name }),
            });
            queryClient.invalidateQueries({ queryKey: ["boards"] });
            navigate(`/boards/${data.board.id}`);
          } catch { /* surfaced by query devtools; keep simple */ }
        }}
      >
        <IconDuplicate className="h-4 w-4 inline-block mr-1 -mt-0.5" /> Duplicate
      </Button>

      <div className="ml-auto flex items-center gap-2">
        {/* Star */}
        <button
          aria-label={board.starred ? "Unstar board" : "Star board"}
          title={board.starred ? "Unstar board" : "Star board"}
          onClick={() => toggleStar.mutate(!board.starred)}
          className={`transition-transform hover:scale-110 ${
            board.starred ? "text-amber-500" : "text-muted-foreground/50 hover:text-amber-500"
          }`}
        >
          <IconStar filled={board.starred} className="h-5 w-5" />
        </button>

        {/* Rename (inline click-to-edit on the title) */}
        {renaming ? (
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={async () => {
              setRenaming(false);
              if (renameValue.trim() && renameValue !== board.name) {
                await patchBoard.mutateAsync({ name: renameValue.trim() });
              }
            }}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                setRenaming(false);
                if (renameValue.trim() && renameValue !== board.name) {
                  await patchBoard.mutateAsync({ name: renameValue.trim() });
                }
              }
              if (e.key === "Escape") setRenaming(false);
            }}
            className="h-8 w-64"
          />
        ) : (
          <h1
            className="text-xl font-bold cursor-text hover:bg-accent px-2"
            title="Click to rename"
            onClick={() => {
              setRenameValue(board.name);
              setRenaming(true);
            }}
          >
            {board.name}
          </h1>
        )}
      </div>

      {/* Share dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share “{board.name}”</DialogTitle>
            <DialogDescription>
              This board is {visibilityMeta.label.toLowerCase()} —{" "}
              {visibilityMeta.hint.toLowerCase()}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={shareLink} onFocus={(e) => e.currentTarget.select()} />
            <Button variant="outline" onClick={copyLink}>{copied ? "Copied!" : "Copy"}</Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
