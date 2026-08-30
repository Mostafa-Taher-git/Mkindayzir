import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type Storm = { id: string; name: string; x: number; y: number; width: number; height: number; isArchived: boolean };
type Link = { id: string; fromStormId: string; fromCorner: number; toStormId: string; toCorner: number };

const STORM_W = 200;
const STORM_H = 88;
const CIRCLE_R = 7;

function cornerPos(storm: Storm, corner: number) {
  const { x, y, width, height } = storm;
  // 0 NW (top-left), 1 NE (top-right), 2 SW (bottom-left), 3 SE (bottom-right)
  if (corner === 0) return { x: x, y: y };
  if (corner === 1) return { x: x + width, y: y };
  if (corner === 2) return { x: x, y: y + height };
  return { x: x + width, y: y + height };
}

function StormIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 15h10a4 4 0 0 0 0-8 7 7 0 0 0-12 4.8" />
      <path d="M8 19a5 5 0 0 0 10 0 5 5 0 0 0-5-5h-2" />
      <path d="M13 15l-3 4 3 4" />
    </svg>
  );
}

export default function StormsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspace = useWorkspace();
  const wsParam = workspace.type === "org" ? workspace.orgId : "personal";

  const [showArchived, setShowArchived] = React.useState(false);
  const [newOpen, setNewOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [pan, setPan] = React.useState({ x: 80, y: 80 });
  const [scale, setScale] = React.useState(1);
  const [isPanning, setIsPanning] = React.useState(false);
  const [panStart, setPanStart] = React.useState({ x: 0, y: 0, panX: 0, panY: 0 });
  const [dragging, setDragging] = React.useState<null | { id: string; startX: number; startY: number; orig: Map<string, { x: number; y: number }>; group: string[] }>(null);
  const [linkDrag, setLinkDrag] = React.useState<null | { fromId: string; fromCorner: number; curX: number; curY: number }>(null);
  const [renameId, setRenameId] = React.useState<string | null>(null);
  const [renameName, setRenameName] = React.useState("");

  const containerRef = React.useRef<HTMLDivElement>(null);

  const { data: stormsData, isLoading } = useQuery({
    queryKey: ["storms", wsParam, showArchived],
    queryFn: async () => {
      const q = new URLSearchParams({ workspace: wsParam });
      if (showArchived) q.set("includeArchived", "true");
      const r = await api.get<{ storms: Storm[] }>(`/api/storms/?${q.toString()}`);
      return r as unknown as { storms: Storm[] };
    },
  });
  const { data: linksData } = useQuery({
    queryKey: ["storm-links", wsParam],
    queryFn: async () => {
      const r = await api.get<{ links: Link[] }>(`/api/storms/links?workspace=${wsParam}`);
      return r as unknown as { links: Link[] };
    },
  });

  const storms: Storm[] = (stormsData as any)?.storms ?? [];
  const links: Link[] = (linksData as any)?.links ?? [];

  const stormMap = React.useMemo(() => new Map(storms.map((s) => [s.id, s])), [storms]);

  const createMut = useMutation({
    mutationFn: async (name: string) => {
      const r = await api.post<{ storm: Storm }>("/api/storms/", { name, workspace: wsParam, x: 0, y: 0 });
      return r as unknown as { storm: Storm };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storms"] });
      setNewOpen(false);
      setNewName("");
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await api.patch<{ storm: Storm }>(`/api/storms/${id}`, data);
      return r as unknown as { storm: Storm };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["storms"] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/storms/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storms"] });
      queryClient.invalidateQueries({ queryKey: ["storm-links"] });
    },
  });

  const createLinkMut = useMutation({
    mutationFn: async (p: { fromStormId: string; fromCorner: number; toStormId: string; toCorner: number }) => {
      const r = await api.post<{ link: Link }>("/api/storms/links", p);
      return r as unknown as { link: Link };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["storm-links"] }),
    onError: (e: any) => alert(e.message || "Link failed (max 3 per circle, 12 per storm)"),
  });

  const deleteLinkMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/storms/links/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["storm-links"] }),
  });

  // helper: build adjacency for group move
  const getLinkedGroup = React.useCallback(
    (startId: string) => {
      const adj = new Map<string, Set<string>>();
      for (const l of links) {
        if (!adj.has(l.fromStormId)) adj.set(l.fromStormId, new Set());
        if (!adj.has(l.toStormId)) adj.set(l.toStormId, new Set());
        adj.get(l.fromStormId)!.add(l.toStormId);
        adj.get(l.toStormId)!.add(l.fromStormId);
      }
      const visited = new Set<string>();
      const queue = [startId];
      visited.add(startId);
      while (queue.length) {
        const cur = queue.shift()!;
        const neigh = adj.get(cur);
        if (!neigh) continue;
        for (const n of neigh) if (!visited.has(n)) { visited.add(n); queue.push(n); }
      }
      return Array.from(visited);
    },
    [links]
  );

  const worldToScreen = (wx: number, wy: number) => ({ x: wx * scale + pan.x, y: wy * scale + pan.y });
  const screenToWorld = (sx: number, sy: number, rect: DOMRect) => ({
    x: (sx - rect.left - pan.x) / scale,
    y: (sy - rect.top - pan.y) / scale,
  });

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      setScale((s) => Math.min(3, Math.max(0.2, s + delta)));
    } else {
      // pan with wheel
      // setPan(p => ({x: p.x - e.deltaX, y: p.y - e.deltaY}));
    }
  };

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // only pan if clicking background (not a storm)
    const target = e.target as HTMLElement;
    if (target.closest("[data-storm-node]") || target.closest("[data-circle]") || target.closest("[data-link]")) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y });
  };
  const onCanvasMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: panStart.panX + (e.clientX - panStart.x), y: panStart.panY + (e.clientY - panStart.y) });
    }
    if (dragging && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const cur = screenToWorld(e.clientX, e.clientY, rect);
      const startWorld = screenToWorld(dragging.startX, dragging.startY, rect);
      const dx = cur.x - startWorld.x;
      const dy = cur.y - startWorld.y;
      // update all in group locally (optimistic)
      // we mutate via patch after mouse up; for now just update visual via state? Simplest: update via DOM transform then persist on up
      // We'll store dragging delta and apply render offset
      setDragging((d) => (d ? { ...d, startX: dragging.startX, startY: dragging.startY } as any : null));
      // Instead, we directly update pan? No.
      // We'll keep a ref of delta and render with offset
      (dragging as any)._dx = dx;
      (dragging as any)._dy = dy;
      // force re-render
      setPan((p) => ({ ...p }));
    }
    if (linkDrag && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const cur = screenToWorld(e.clientX, e.clientY, rect);
      setLinkDrag((l) => (l ? { ...l, curX: cur.x, curY: cur.y } : null));
    }
  };
  const onCanvasMouseUp = async (e: React.MouseEvent) => {
    setIsPanning(false);
    if (dragging) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const cur = screenToWorld(e.clientX, e.clientY, rect);
        const startWorld = screenToWorld(dragging.startX, dragging.startY, rect);
        const dx = cur.x - startWorld.x;
        const dy = cur.y - startWorld.y;
        // persist each storm in group
        for (const sid of dragging.group) {
          const orig = dragging.orig.get(sid);
          if (!orig) continue;
          const nx = orig.x + dx;
          const ny = orig.y + dy;
          // fire and forget, but await sequentially to avoid flood
          try { await api.patch(`/api/storms/${sid}`, { x: nx, y: ny }); } catch {}
        }
        queryClient.invalidateQueries({ queryKey: ["storms"] });
      }
      setDragging(null);
    }
    if (linkDrag) {
      // check if over a circle
      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const circle = target?.closest("[data-circle]") as HTMLElement | null;
      if (circle) {
        const toId = circle.dataset.storm as string;
        const toCorner = parseInt(circle.dataset.corner as string, 10);
        if (toId && !isNaN(toCorner) && toId !== linkDrag.fromId) {
          createLinkMut.mutate({ fromStormId: linkDrag.fromId, fromCorner: linkDrag.fromCorner, toStormId: toId, toCorner });
        }
      }
      setLinkDrag(null);
    }
  };

  const startNodeDrag = (e: React.MouseEvent, storm: Storm) => {
    e.stopPropagation();
    const group = getLinkedGroup(storm.id);
    const orig = new Map<string, { x: number; y: number }>();
    for (const sid of group) {
      const s = stormMap.get(sid);
      if (s) orig.set(sid, { x: s.x, y: s.y });
    }
    setDragging({ id: storm.id, startX: e.clientX, startY: e.clientY, orig, group });
    (setDragging as any)._dx = 0;
  };

  const startLinkDrag = (e: React.MouseEvent, stormId: string, corner: number) => {
    e.stopPropagation();
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cur = screenToWorld(e.clientX, e.clientY, rect);
    setLinkDrag({ fromId: stormId, fromCorner: corner, curX: cur.x, curY: cur.y });
  };

  const handleNodeClick = (storm: Storm, e: React.MouseEvent) => {
    // if was dragging, ignore click
    if (dragging) return;
    // if clicked circle, ignore
    const target = e.target as HTMLElement;
    if (target.closest("[data-circle]")) return;
    navigate(`/storms/${storm.id}`);
  };

  // derived render positions with drag offset
  const renderStorms = React.useMemo(() => {
    if (!dragging) return storms;
    const dx = (dragging as any)._dx || 0;
    const dy = (dragging as any)._dy || 0;
    return storms.map((s) => {
      if (dragging.group.includes(s.id)) {
        const o = dragging.orig.get(s.id);
        if (o) return { ...s, x: o.x + dx, y: o.y + dy };
      }
      return s;
    });
  }, [storms, dragging]);

  const renderMap = React.useMemo(() => new Map(renderStorms.map((s) => [s.id, s])), [renderStorms]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between p-4 border-b bg-surface">
        <div className="flex items-center gap-3">
          <StormIcon className="h-5 w-5" />
          <h1 className="text-xl font-bold font-mono uppercase tracking-wider">Storms</h1>
          <span className="text-sm text-muted-foreground">{storms.length} storms</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide archived" : "Show archived"}
          </Button>
          <Button onClick={() => setNewOpen(true)}>New Storm</Button>
          <div className="flex items-center gap-1 ml-2 border rounded-md p-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale((s) => Math.min(3, s + 0.1))}>+</Button>
            <span className="text-xs font-mono w-10 text-center">{Math.round(scale * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale((s) => Math.max(0.2, s - 0.1))}>−</Button>
            <Button variant="ghost" size="sm" className="h-7" onClick={() => { setPan({ x: 80, y: 80 }); setScale(1); }}>Reset</Button>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-[#fafafa] dark:bg-[#0e0e0f] select-none"
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onCanvasMouseMove}
        onMouseUp={onCanvasMouseUp}
        onMouseLeave={onCanvasMouseUp}
        onWheel={handleWheel}
        style={{ cursor: isPanning ? "grabbing" : dragging ? "grabbing" : "grab" }}
      >
        {/* infinite grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(0,0,0,0.12) 1px, transparent 1px)",
            backgroundSize: `${20 * scale}px ${20 * scale}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />

        {/* world */}
        <div
          className="absolute inset-0"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: "0 0" }}
        >
          {/* links */}
          <svg className="absolute inset-0 overflow-visible pointer-events-none" style={{ width: 5000, height: 5000, left: -1000, top: -1000 }}>
            {links.map((l) => {
              const a = renderMap.get(l.fromStormId);
              const b = renderMap.get(l.toStormId);
              if (!a || !b) return null;
              const pa = cornerPos(a, l.fromCorner);
              const pb = cornerPos(b, l.toCorner);
              // hand-drawn slight curve
              const mx = (pa.x + pb.x) / 2;
              const my = (pa.y + pb.y) / 2;
              const dx = pb.x - pa.x;
              const dy = pb.y - pa.y;
              const off = Math.min(24, Math.hypot(dx, dy) * 0.15);
              const cx = mx + (dy ? (dx > 0 ? -off : off) * 0.3 : 0);
              const cy = my + (dx ? (dy > 0 ? off : -off) * 0.3 : 0);
              return (
                <g key={l.id} className="pointer-events-auto" data-link={l.id}>
                  <path
                    d={`M ${pa.x} ${pa.y} Q ${cx} ${cy} ${pb.x} ${pb.y}`}
                    fill="none"
                    stroke="rgba(0,0,0,0.55)"
                    strokeWidth={2}
                    strokeLinecap="round"
                    className="dark:stroke-white/60 hover:stroke-primary cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Cut this link?")) deleteLinkMut.mutate(l.id);
                    }}
                  />
                  <circle cx={pa.x} cy={pa.y} r={2} fill="currentColor" className="text-primary" />
                  <circle cx={pb.x} cy={pb.y} r={2} fill="currentColor" className="text-primary" />
                </g>
              );
            })}
            {linkDrag && (() => {
              const a = renderMap.get(linkDrag.fromId);
              if (!a) return null;
              const pa = cornerPos(a, linkDrag.fromCorner);
              return (
                <path
                  d={`M ${pa.x} ${pa.y} L ${linkDrag.curX} ${linkDrag.curY}`}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  strokeDasharray="6 6"
                  strokeLinecap="round"
                />
              );
            })()}
          </svg>

          {/* storm nodes */}
          {renderStorms.map((s) => (
            <div
              key={s.id}
              data-storm-node
              onMouseDown={(e) => startNodeDrag(e, s)}
              onClick={(e) => handleNodeClick(s, e)}
              className="absolute group flex items-center justify-center bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-700 shadow-[3px_3px_0_0_rgba(0,0,0,1)] dark:shadow-[3px_3px_0_0_rgba(255,255,255,0.15)] hover:border-primary cursor-pointer"
              style={{ left: s.x, top: s.y, width: s.width, height: s.height, borderRadius: 12 }}
              title={s.name}
            >
              {/* hand-drawn border wobble via outline offset */}
              <span className="px-3 text-sm font-medium font-mono text-center leading-tight truncate w-[92%] select-none" dir="auto">
                {s.name}
              </span>

              {/* 4 corner circles */}
              {[0, 1, 2, 3].map((corner) => {
                const isTop = corner < 2;
                const isLeft = corner % 2 === 0;
                // count links per circle for badge/cap UI
                const cnt = links.filter(
                  (l) => (l.fromStormId === s.id && l.fromCorner === corner) || (l.toStormId === s.id && l.toCorner === corner)
                ).length;
                const atCap = cnt >= 3;
                return (
                  <button
                    key={corner}
                    data-circle
                    data-storm={s.id}
                    data-corner={corner}
                    onMouseDown={(e) => startLinkDrag(e, s.id, corner)}
                    title={atCap ? "Max 3 lines" : "Drag to link"}
                    className={`absolute w-3.5 h-3.5 rounded-full border-2 bg-white dark:bg-zinc-900 flex items-center justify-center
                      ${atCap ? "border-zinc-400 opacity-60 cursor-not-allowed" : "border-zinc-900 dark:border-zinc-200 hover:bg-primary hover:border-primary hover:scale-110 cursor-crosshair"}
                      transition-all`}
                    style={{
                      left: isLeft ? -CIRCLE_R : undefined,
                      right: !isLeft ? -CIRCLE_R : undefined,
                      top: isTop ? -CIRCLE_R : undefined,
                      bottom: !isTop ? -CIRCLE_R : undefined,
                    }}
                  >
                    <span className="w-1 h-1 rounded-full bg-zinc-900 dark:bg-zinc-200 group-hover:bg-white" />
                  </button>
                );
              })}

              {/* actions */}
              <div className="absolute -top-2 -right-2 hidden group-hover:flex gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenameId(s.id);
                    setRenameName(s.name);
                  }}
                  className="h-6 w-6 rounded-full bg-white dark:bg-zinc-800 border border-zinc-900 dark:border-zinc-700 flex items-center justify-center text-[10px] hover:bg-zinc-900 hover:text-white"
                  title="Rename"
                >
                  ✎
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Archive "${s.name}"?`)) updateMut.mutate({ id: s.id, isArchived: true });
                  }}
                  className="h-6 w-6 rounded-full bg-white dark:bg-zinc-800 border border-zinc-900 dark:border-zinc-700 flex items-center justify-center text-[10px] hover:bg-amber-500 hover:text-white"
                  title="Archive"
                >
                  ⧉
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${s.name}"?`)) deleteMut.mutate(s.id);
                  }}
                  className="h-6 w-6 rounded-full bg-white dark:bg-zinc-800 border border-zinc-900 dark:border-zinc-700 flex items-center justify-center text-[10px] hover:bg-red-600 hover:text-white"
                  title="Delete"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>

        {!isLoading && storms.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-700 p-8 rounded-xl shadow-[6px_6px_0_0_rgba(0,0,0,1)] text-center max-w-sm pointer-events-auto">
              <StormIcon className="h-10 w-10 mx-auto mb-3" />
              <h3 className="font-bold font-mono uppercase">No storms yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Create your first storm — just a name. Link storms via the 4 corner circles (3 lines per circle, 12 per storm).</p>
              <Button className="mt-4" onClick={() => setNewOpen(true)}>New Storm</Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Storm</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Storm name (board name)</label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Q4 Launch" maxLength={80} autoFocus onKeyDown={(e) => e.key === "Enter" && newName.trim() && createMut.mutate(newName.trim())} dir="auto" />
            <p className="text-xs text-muted-foreground">All rectangles same size — name is truncated inside.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button disabled={!newName.trim() || createMut.isPending} onClick={() => createMut.mutate(newName.trim())}>
              {createMut.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameId} onOpenChange={(o) => !o && setRenameId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename Storm</DialogTitle></DialogHeader>
          <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} maxLength={80} dir="auto" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameId(null)}>Cancel</Button>
            <Button
              disabled={!renameName.trim()}
              onClick={() => {
                if (!renameId) return;
                updateMut.mutate({ id: renameId, name: renameName.trim() });
                setRenameId(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="hidden sm:flex items-center gap-2 px-4 py-2 border-t bg-surface text-xs font-mono text-muted-foreground">
        <span>Drag background to pan</span><span>•</span><span>Ctrl+Wheel to zoom</span><span>•</span><span>Drag storm to move (linked storms move together)</span><span>•</span><span>Drag circle → circle to link</span><span>•</span><span>Click line to cut</span><span>•</span><span>Click storm to open board</span>
      </div>
    </div>
  );
}
