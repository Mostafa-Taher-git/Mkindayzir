import { Link } from "react-router-dom";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { ROUTES } from "@/lib/constants";

const BACKGROUND_PRESETS = [
  "#bb152c",
  "#001522",
  "#c7e7ff",
  "#1e3a5f",
  "#2a9d8f",
  "#e9c46a",
];

export default function BoardsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newSpaceId, setNewSpaceId] = React.useState("");
  const [newBackground, setNewBackground] = React.useState<string | undefined>(undefined);

  const { data: boardsData, isLoading: boardsLoading } = useQuery({
    queryKey: ["boards"],
    queryFn: async () => {
      const res = await fetch("/api/boards", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch boards");
      return res.json() as Promise<{ boards: any[] }>;
    },
  });

  const { data: spacesData } = useQuery({
    queryKey: ["spaces"],
    queryFn: async () => {
      const res = await fetch("/api/spaces", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch spaces");
      return res.json() as Promise<{ spaces: any[] }>;
    },
  });

  const spaces = spacesData?.spaces ?? [];
  const boards = boardsData?.boards ?? [];

  React.useEffect(() => {
    if (open && spaces.length === 1 && !newSpaceId) {
      setNewSpaceId(spaces[0].id);
    }
  }, [open, spaces, newSpaceId]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, { spaceId: string; boards: any[] }>();
    for (const b of boards) {
      const spaceName = b.space?.name ?? "Unknown Space";
      const spaceId = b.space?.id ?? "";
      if (!map.has(spaceName)) map.set(spaceName, { spaceId, boards: [] });
      map.get(spaceName)!.boards.push(b);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, ...value }));
  }, [boards]);

  const createMutation = useMutation({
    mutationFn: async (payload: { spaceId: string; name: string; background?: string }) => {
      const res = await fetch("/api/boards", {credentials: "include", 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? "Failed to create board");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["boards"] });
      setOpen(false);
      setNewName("");
      setNewSpaceId("");
      setNewBackground(undefined);
    },
  });

  const handleCreate = () => {
    if (!newName.trim() || !newSpaceId) return;
    createMutation.mutate({
      spaceId: newSpaceId,
      name: newName.trim(),
      ...(newBackground ? { background: newBackground } : {}),
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Boards</h1>
          <p className="text-muted-foreground mt-1">Visual task boards</p>
        </div>
        {spaces.length === 0 ? (
          <Button asChild>
            <Link to={`${ROUTES.SPACES}/new`}>Create a Space first</Link>
          </Button>
        ) : (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4">
                  <path d="M5 12h14" />
                  <path d="M12 5v14" />
                </svg>
                New Board
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Board</DialogTitle>
                <DialogDescription>
                  Boards organize tasks into columns within a space.
                </DialogDescription>
              </DialogHeader>

              {spaces.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You need to create a Space first.{" "}
                  <Link to={`${ROUTES.SPACES}/new`} className="text-primary underline">
                    Go to Spaces
                  </Link>
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="board-space">Space</Label>
                    <Select
                      value={newSpaceId}
                      onChange={(e) => setNewSpaceId(e.target.value)}
                      options={spaces.map((s: any) => ({ value: s.id, label: s.name }))}
                      placeholder="Select a space"
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="board-name">Board name</Label>
                    <Input
                      id="board-name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Sprint Board"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Background</Label>
                    <div className="flex flex-wrap gap-2">
                      {BACKGROUND_PRESETS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewBackground(color)}
                          className={`h-7 w-7 rounded border-2 ${
                            newBackground === color ? "border-primary" : "border-transparent"
                          }`}
                          style={{ backgroundColor: color }}
                          aria-label={`Set background ${color}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button
                  onClick={handleCreate}
                  disabled={spaces.length === 0 || !newName.trim() || !newSpaceId || createMutation.isPending}
                >
                  {createMutation.isPending ? "Creating..." : "Create Board"}
                </Button>
              </DialogFooter>
              {createMutation.isError && (
                <p className="text-sm text-destructive">{createMutation.error.message}</p>
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>

      {boardsLoading ? (
        <p className="text-sm text-muted-foreground">Loading boards...</p>
      ) : boards.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No boards yet</CardTitle>
            <CardDescription>
              {spaces.length === 0
                ? "Create a Space first, then add boards to organize your work."
                : "Create your first board to start organizing tasks."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="mt-2">
              <Link to={spaces.length === 0 ? `${ROUTES.SPACES}/new` : "#"} onClick={() => spaces.length > 0 && setOpen(true)}>
                {spaces.length === 0 ? "Create Space" : "Create your first board"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.name}>
              <h2 className="mb-3 font-mono text-sm uppercase tracking-wider text-muted-foreground">
                — {group.name} —
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.boards.map((board: any) => (
                  <Link key={board.id} to={`${ROUTES.BOARDS}/${board.id}`} className="block">
                    <Card className="h-full transition-shadow hover:shadow-md">
                      {board.background && (
                        <div className="h-1.5 w-full rounded-t" style={{ backgroundColor: board.background }} />
                      )}
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-lg">{board.name}</CardTitle>
                          <Badge variant="secondary" className="shrink-0">
                            {group.name}
                          </Badge>
                        </div>
                        <CardDescription className="line-clamp-2">
                          {board.description || "No description"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <span className="text-xs text-muted-foreground">
                          {board._count?.columns ?? 0} column
                          {(board._count?.columns ?? 0) !== 1 ? "s" : ""}
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
