/**
 * Workspace — the boards home.
 *
 * Flow (Trello-style):
 *   1. Pick a space (or create one inline).
 *   2. See that space's boards — starred boards float to the top.
 *   3. Create a board, open one, or link the space to a project.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROUTES, BOARD_BACKGROUNDS } from "@/lib/constants";

type Space = { id: string; name: string; description?: string | null; visibility?: string };
type BoardItem = {
  id: string;
  spaceId: string;
  name: string;
  background?: string | null;
  starred?: boolean;
  spaceName?: string | null;
};

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store", ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err?.error?.message || err?.message || "Request failed");
  }
  return res.json();
}

export default function WorkspacePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedSpaceId, setSelectedSpaceId] = React.useState<string>("");
  const [showNewSpace, setShowNewSpace] = React.useState(false);
  const [newSpaceName, setNewSpaceName] = React.useState("");
  const [showNewBoard, setShowNewBoard] = React.useState(false);
  const [newBoardName, setNewBoardName] = React.useState("");
  const [newBoardBg, setNewBoardBg] = useStateSafe("#1f2937");
  const [linkProjectOpen, setLinkProjectOpen] = React.useState(false);
  const [linkProjectId, setLinkProjectId] = React.useState("");

  // ---------- data ----------
  const spacesQ = useQuery({
    queryKey: ["spaces"],
    queryFn: () => jfetch<{ spaces: Space[] }>("/api/spaces"),
  });
  const boardsQ = useQuery({
    queryKey: ["boards"],
    queryFn: () => jfetch<{ boards: BoardItem[] }>("/api/boards"),
  });
  const projectsQ = useQuery({
    queryKey: ["projects"],
    queryFn: () => jfetch<{ projects: Array<{ id: string; name: string; key: string }> }>("/api/projects"),
  });

  const spaces = spacesQ.data?.spaces ?? [];
  const boards = boardsQ.data?.boards ?? [];
  const projects = projectsQ.data?.projects ?? [];

  // auto-select the first space once loaded
  React.useEffect(() => {
    if (!selectedSpaceId && spaces.length > 0) setSelectedSpaceId(spaces[0].id);
  }, [spaces, selectedSpaceId]);

  const selectedSpace = spaces.find((s) => s.id === selectedSpaceId) ?? null;
  const spaceBoardsRaw = boards.filter((b) => b.spaceId === selectedSpaceId);
  // starred first, then original order
  const spaceBoards = [
    ...spaceBoardsRaw.filter((b) => b.starred),
    ...spaceBoardsRaw.filter((b) => !b.starred),
  ];

  // ---------- mutations ----------
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["spaces"] });
    queryClient.invalidateQueries({ queryKey: ["boards"] });
  };

  const createSpace = useMutation({
    mutationFn: () =>
      jfetch("/api/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSpaceName }),
      }),
    onSuccess: (data: any) => {
      invalidateAll();
      setShowNewSpace(false);
      setNewSpaceName("");
      if (data?.space?.id || data?.id) setSelectedSpaceId(data.space?.id ?? data.id);
    },
  });

  const createBoard = useMutation({
    mutationFn: () =>
      jfetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: selectedSpaceId, name: newBoardName, background: newBoardBg }),
      }),
    onSuccess: (data: any) => {
      invalidateAll();
      setShowNewBoard(false);
      setNewBoardName("");
      navigate(`${ROUTES.BOARDS}/${data.board?.id ?? data.id}`);
    },
  });

  const toggleStar = useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) =>
      jfetch(`/api/boards/${id}/star`, { method: starred ? "POST" : "DELETE" }),
    onSuccess: invalidateAll,
  });

  const linkProject = useMutation({
    mutationFn: (projectId: string) =>
      jfetch(`/api/spaces/${selectedSpaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      setLinkProjectOpen(false);
      setLinkProjectId("");
    },
  });

  // ---------- render ----------
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Workspace</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Spaces hold your boards. Star a board to pin it to the top.
          </p>
        </div>
        <Button onClick={() => setShowNewSpace(true)}>+ New Space</Button>
      </div>

      {/* Space chooser */}
      <div className="flex flex-wrap gap-2 items-center">
        {spaces.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedSpaceId(s.id)}
            className={`px-4 py-2 border-2 font-mono text-xs uppercase tracking-wide transition-colors ${
              s.id === selectedSpaceId
                ? "border-primary bg-primary/10 text-primary-light"
                : "border-outline hover:border-primary"
            }`}
          >
            {s.name}
          </button>
        ))}
        <button
          onClick={() => setShowNewSpace(true)}
          className="px-3 py-2 border-2 border-dashed border-outline text-sm text-muted-foreground hover:border-primary hover:text-foreground"
        >
          + Space
        </button>
      </div>

      {!spacesQ.isLoading && spaces.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center space-y-3">
            <div className="text-lg font-semibold">No spaces yet</div>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              A workspace starts with a space — think “Marketing”, “Product”, or
              “Operations”. Inside each space you create boards for your team's work.
            </p>
            <Button onClick={() => setShowNewSpace(true)}>Create your first space</Button>
          </CardContent>
        </Card>
      )}

      {/* Starred boards — across ALL spaces, Trello-style */}
      {boards.some((b) => b.starred) && (
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 mb-3">☆ Starred boards</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {boards.filter((b) => b.starred).map((b) => (
              <BoardTile key={b.id} board={b} onOpen={() => navigate(`${ROUTES.BOARDS}/${b.id}`)} onToggleStar={() => toggleStar.mutate({ id: b.id, starred: false })} />
            ))}
          </div>
        </div>
      )}

      {/* Boards of the selected space */}
      {selectedSpace && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-outline">
            <div>
              <h2 className="text-xl font-bold">{selectedSpace.name}</h2>
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                {spaceBoards.filter((b) => b.starred).length > 0 &&
                  `${spaceBoards.filter((b) => b.starred).length} starred · `}
                {spaceBoards.length} board{spaceBoards.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLinkProjectOpen(true)}>
                Link to Project
              </Button>
              <Button onClick={() => setShowNewBoard(true)}>+ New Board</Button>
            </div>
          </div>

          {spaceBoards.length === 0 ? (
            <div className="border-2 border-dashed border-outline p-10 text-center text-muted-foreground">
              No boards in this space yet. Create your first board to start tracking work.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {spaceBoards.map((b) => (
                <BoardTile
                  key={b.id}
                  board={b}
                  onOpen={() => navigate(`${ROUTES.BOARDS}/${b.id}`)}
                  onToggleStar={() => toggleStar.mutate({ id: b.id, starred: !b.starred })}
                />
              ))}

              {/* create-board tile */}
              <button
                onClick={() => setShowNewBoard(true)}
                className="border-2 border-outline min-h-[132px] flex items-center justify-center text-sm font-mono uppercase tracking-wide text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
              >
                + Create new board
              </button>
            </div>
          )}
        </>
      )}

      {/* New Space dialog */}
      <Dialog open={showNewSpace} onOpenChange={setShowNewSpace}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a space</DialogTitle>
            <DialogDescription>Spaces group related boards together.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="e.g. Operations"
            value={newSpaceName}
            onChange={(e) => setNewSpaceName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newSpaceName.trim()) createSpace.mutate();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSpace(false)}>Cancel</Button>
            <Button disabled={!newSpaceName.trim() || createSpace.isPending} onClick={() => createSpace.mutate()}>
              {createSpace.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Board dialog */}
      <Dialog open={showNewBoard} onOpenChange={setShowNewBoard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a board in {selectedSpace?.name}</DialogTitle>
            <DialogDescription>Pick a background — you can change it later.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Board name, e.g. Defect Reports"
            value={newBoardName}
            onChange={(e) => setNewBoardName(e.target.value)}
          />
          <div className="flex flex-wrap gap-2 pt-1">
            {BOARD_BACKGROUNDS.map((bg) => (
              <button
                key={bg.value}
                type="button"
                aria-label={bg.label}
                onClick={() => setNewBoardBg(bg.value)}
                className={`h-8 w-8 border-2 ${newBoardBg === bg.value ? "border-primary ring-2 ring-primary/40" : "border-transparent"}`}
                style={{ backgroundColor: bg.value }}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBoard(false)}>Cancel</Button>
            <Button disabled={!newBoardName.trim() || createBoard.isPending} onClick={() => createBoard.mutate()}>
              {createBoard.isPending ? "Creating…" : "Create board"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link space → project dialog */}
      <Dialog open={linkProjectOpen} onOpenChange={setLinkProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link “{selectedSpace?.name}” to a project</DialogTitle>
            <DialogDescription>Boards in this space will be associated with the project.</DialogDescription>
          </DialogHeader>
          <select
            value={linkProjectId}
            onChange={(e) => setLinkProjectId(e.target.value)}
            className="w-full px-3 py-2 border-2 border-outline bg-surface font-mono text-sm"
          >
            <option value="">— choose a project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.key} · {p.name}</option>
            ))}
          </select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkProjectOpen(false)}>Cancel</Button>
            <Button
              disabled={!linkProjectId || linkProject.isPending}
              onClick={() => linkProject.mutate(linkProjectId)}
            >
              {linkProject.isPending ? "Linking…" : "Link project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// tiny helper so the bg state hook reads naturally above
function useStateSafe(initial: string): [string, (v: string) => void] {
  const [v, setV] = React.useState(initial);
  return [v, setV];
}


function BoardTile({
  board,
  onOpen,
  onToggleStar,
}: {
  board: BoardItem;
  onOpen: () => void;
  onToggleStar: () => void;
}) {
  return (
    <Card className="overflow-hidden group relative">
      <button
        aria-label={board.starred ? "Unstar board" : "Star board"}
        title={board.starred ? "Unstar" : "Star"}
        onClick={(e) => { e.stopPropagation(); onToggleStar(); }}
        className={`absolute top-2 right-2 z-10 h-6 w-6 flex items-center justify-center rounded bg-black/25 text-base leading-none transition-transform ${
          board.starred ? "text-amber-300 scale-110" : "text-white/70 opacity-0 group-hover:opacity-100 hover:text-amber-300"
        }`}
      >
        {board.starred ? "★" : "☆"}
      </button>
      <button className="block w-full text-left" onClick={onOpen}>
        <div className="h-20 w-full bg-cover bg-center" style={{ backgroundColor: board.background || "#1f2937" }} />
        <CardContent className="p-3">
          <div className="font-semibold truncate">{board.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            {board.spaceName || ""}
          </div>
        </CardContent>
      </button>
    </Card>
  );
}
