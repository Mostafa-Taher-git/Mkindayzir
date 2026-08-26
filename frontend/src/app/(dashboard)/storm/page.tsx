/**
 * Storm canvas: pan/zoom, fixed-size cards, 4 corner circles,
 * drag-with-subtree, link creation, cap enforcement, create-anywhere,
 * fit-to-view, archive. Note opening via dialog on click.
 *
 * The card visual is an inline div + SVG circles so text stays real text
 * (selectable, accessible) while links are straight SVG lines from circle
 * centers to circle centers.
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { STORM_ROUTES, ROUTES } from "@/lib/constants";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCreateStorm, useDeleteStorm, useUpdateStorm, useCreateLink, useDeleteLink, useMoveSubtree } from "@/hooks/use-storms";

const CANVAS_CARD_W = 200;
const CANVAS_CARD_H = 120;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

export default function StormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["storms"],
    queryFn: async () => {
      const res = await fetch("/api/storms", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const create = useCreateStorm();
  const remove = useDeleteStorm();
  const update = useUpdateStorm();
  const createLink = useCreateLink();
  const deleteLink = useDeleteLink();
  const moveSubtree = useMoveSubtree();

  const [storms, setStorms] = React.useState<Array<{ id: string; name: string; positionX: number; positionY: number; isArchived: boolean }>>([]);
  const [links, setLinks] = React.useState<Array<{ id: string; sourceId: string; sourceCorner: number; targetId: string; targetCorner: number }>>([]);
  React.useEffect(() => {
    if (data?.storms) setStorms(data.storms);
    if (data?.links) setLinks(data.links);
  }, [data]);

  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [draftName, setDraftName] = React.useState("");
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameText, setRenameText] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // Drag state for linking from corners
  const [linking, setLinking] = React.useState<{ stormId: string; corner: number; mouseX: number; mouseY: number } | null>(null);

  // Canvas pan/zoom refs
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = React.useState(false);
  const [panStart, setPanStart] = React.useState({ x: 0, y: 0, mx: 0, my: 0 });
  const [dragState, setDragState] = React.useState<{ stormId: string; originX: number; originY: number; subtreeIds: Set<string> } | null>(null);

  const toCanvas = React.useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  const cornerFor = React.useCallback(
    (stormId: string, cx: number, cy: number) => {
      // Nearest corner of the fixed card rect
      const s = storms.find((x) => x.id === stormId);
      if (!s) return 0;
      const x = s.positionX;
      const y = s.positionY;
      const corners = [
        { x, y },
        { x: x + CANVAS_CARD_W, y },
        { x, y: y + CANVAS_CARD_H },
        { x: x + CANVAS_CARD_W, y: y + CANVAS_CARD_H },
      ] as const;
      let best = 0;
      let bestD = Infinity;
      corners.forEach((c, i) => {
        const d = (c.x - cx) ** 2 + (c.y - cy) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    },
    [storms]
  );

  const capFor = React.useCallback(
    (stormId: string, corner: number) => {
      let cornerCount = 0;
      let stormCount = 0;
      for (const l of links) {
        const hits = (l.sourceId === stormId && l.sourceCorner === corner) || (l.targetId === stormId && l.targetCorner === corner);
        if (hits) cornerCount++;
        if (l.sourceId === stormId || l.targetId === stormId) stormCount++;
      }
      return { cornerCount, stormCount };
    },
    [links]
  );

  const canLink = React.useCallback(
    (sourceId: string, sourceCorner: number, targetId: string, targetCorner: number) => {
      if (sourceId === targetId) return false;
      if (links.some((l) => l.sourceId === sourceId && l.sourceCorner === sourceCorner && l.targetId === targetId && l.targetCorner === targetCorner)) return false;
      const s = capFor(sourceId, sourceCorner);
      const t = capFor(targetId, targetCorner);
      return s.cornerCount < 3 && s.stormCount < 12 && t.cornerCount < 3 && t.stormCount < 12;
    },
    [capFor, links]
  );

  const findNearestCard = React.useCallback(
    (cx: number, cy: number) => {
      let best: { id: string; x: number; y: number } | null = null;
      let bestD = Infinity;
      for (const s of storms) {
        const dx = Math.max(s.positionX - cx, 0, cx - (s.positionX + CANVAS_CARD_W));
        const dy = Math.max(s.positionY - cy, 0, cy - (s.positionY + CANVAS_CARD_H));
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = { id: s.id, x: s.positionX, y: s.positionY }; }
      }
      return best;
    },
    [storms]
  );

  const handleWheel = React.useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)));
      setPan((p) => ({ x: mx - (mx - p.x) * factor, y: my - (my - p.y) * factor }));
    },
    []
  );

  const handleCanvasPointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        setIsPanning(true);
        setPanStart({ x: pan.x, y: pan.y, mx: e.clientX, my: e.clientY });
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        return;
      }
      if (e.button === 0 && e.target === canvasRef.current) {
        // create new storm on canvas click
      }
    },
    [pan]
  );

  const handleCanvasPointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      if (isPanning) {
        setPan({ x: panStart.x + (e.clientX - panStart.mx), y: panStart.y + (e.clientY - panStart.my) });
        return;
      }
      if (dragState) {
        const p = toCanvas(e.clientX, e.clientY);
        const current = storms.find((s) => s.id === dragState.stormId);
        const nextX = p.x - dragState.originX;
        const nextY = p.y - dragState.originY;
        const dx = nextX - (current?.positionX ?? dragState.originX);
        const dy = nextY - (current?.positionY ?? dragState.originY);
        setStorms((prev) => prev.map((s) => (dragState.subtreeIds.has(s.id) ? { ...s, positionX: (s.positionX || 0) + dx, positionY: (s.positionY || 0) + dy } : s)));
        setDragState((prev) => (prev ? { ...prev, originX: p.x - dx, originY: p.y - dy } : prev));
      }
    },
    [isPanning, panStart, dragState, toCanvas, storms]
  );

  const handleCanvasPointerUp = React.useCallback((_: React.PointerEvent) => {
    setIsPanning(false);
    setDragState(null);
  }, []);

  const handleCornerPointerDown = React.useCallback(
    (e: React.PointerEvent, stormId: string) => {
      e.stopPropagation();
      const p = toCanvas(e.clientX, e.clientY);
      const corner = cornerFor(stormId, p.x, p.y);
      const { cornerCount } = capFor(stormId, corner);
      if (cornerCount >= 3) return;
      setLinking({ stormId, corner, mouseX: e.clientX, mouseY: e.clientY });
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [toCanvas, cornerFor, capFor]
  );

  const handleCanvasPointerMoveCapture = React.useCallback(
    (e: React.PointerEvent) => {
      if (linking) {
        setLinking((l) => (l ? { ...l, mouseX: e.clientX, mouseY: e.clientY } : null));
      }
    },
    [linking]
  );

  const handleCanvasPointerUpCapture = React.useCallback(
    (e: React.PointerEvent) => {
      if (linking) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const p = toCanvas(e.clientX, e.clientY);
          const target = findNearestCard(p.x, p.y);
          const targetCorner = target ? cornerFor(target.id, p.x, p.y) : 0;
          if (target && canLink(linking.stormId, linking.corner, target.id, targetCorner)) {
            createLink.mutate({ sourceId: linking.stormId, targetId: target.id, sourceCorner: linking.corner, targetCorner });
          }
        }
        setLinking(null);
      }
    },
    [linking, toCanvas, findNearestCard, cornerFor, canLink, createLink]
  );

  const handleCardPointerDown = React.useCallback(
    (e: React.PointerEvent, storm: { id: string; positionX: number; positionY: number }) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).dataset.corner === "true") return;
      e.stopPropagation();
      const subtreeIds = new Set([storm.id]);
      const linked = links.filter((l) => l.sourceId === storm.id || l.targetId === storm.id);
      linked.forEach((l) => { subtreeIds.add(l.sourceId); subtreeIds.add(l.targetId); });
      setDragState({ stormId: storm.id, originX: storm.positionX, originY: storm.positionY, subtreeIds });
      setSelectedId(storm.id);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [links]
  );

  const handleFitView = React.useCallback(() => {
    if (!storms.length || !canvasRef.current) return;
    const minX = Math.min(...storms.map((s) => s.positionX));
    const maxX = Math.max(...storms.map((s) => s.positionX + CANVAS_CARD_W));
    const minY = Math.min(...storms.map((s) => s.positionY));
    const maxY = Math.max(...storms.map((s) => s.positionY + CANVAS_CARD_H));
    const rect = canvasRef.current.getBoundingClientRect();
    const w = maxX - minX || CANVAS_CARD_W;
    const h = maxY - minY || CANVAS_CARD_H;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((rect.width - 80) / w, (rect.height - 80) / h)));
    setZoom(next);
    setPan({ x: rect.width / 2 - (minX + w / 2) * next, y: rect.height / 2 - (minY + h / 2) * next });
  }, [storms]);

  const startRename = React.useCallback((storm: { id: string; name: string }) => {
    setRenamingId(storm.id);
    setRenameText(storm.name);
  }, []);

  const commitRename = React.useCallback(() => {
    if (!renamingId) return;
    const name = renameText.trim();
    if (name) update.mutate({ id: renamingId, patch: { name } });
    setRenamingId(null);
  }, [renameText, renamingId, update]);

  const stormLookup = React.useMemo(() => new Map(storms.map((s) => [s.id, s])), [storms]);

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col">
      <div className="flex items-center justify-between border-b-2 border-outline-strong px-4 py-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold">Storm</h1>
          <span className="text-xs text-muted-foreground">mind map</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleFitView}>Fit view</Button>
          <Button size="sm" onClick={() => setDraftName("new storm")}>+ New</Button>
        </div>
      </div>

      <div
        ref={canvasRef}
        className="relative flex-1 overflow-hidden bg-background"
        onWheel={handleWheel}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={(e) => { handleCanvasPointerMove(e); handleCanvasPointerMoveCapture(e); }}
        onPointerUp={(e) => { handleCanvasPointerUp(e); handleCanvasPointerUpCapture(e); }}
      >
        <div
          className="absolute inset-0"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
        >
          {storms.filter((s) => !s.isArchived).map((s) => {
            const active = selectedId === s.id;
            return (
              <div
                key={s.id}
                className={`absolute rounded-xl border-2 bg-surface p-2 shadow-lg select-none ${active ? "border-accent" : "border-outline"}`}
                style={{ left: s.positionX, top: s.positionY, width: CANVAS_CARD_W, height: CANVAS_CARD_H }}
                onPointerDown={(e) => handleCardPointerDown(e, s)}
                onDoubleClick={() => navigate(`${STORM_ROUTES.HOME}/${s.id}/note`)}
              >
                <div className="flex h-full flex-col">
                  {renamingId === s.id ? (
                    <input
                      autoFocus
                      className="h-full w-full bg-transparent text-sm outline-none"
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingId(null); }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="line-clamp-3 text-sm" title={s.name}>{s.name}</div>
                  )}
                  <div className="mt-auto flex items-center justify-between text-[10px] text-muted-foreground">
                    <button
                      className="underline"
                      onClick={(e) => { e.stopPropagation(); startRename(s); }}
                    >rename</button>
                    <button
                      className="underline"
                      onClick={(e) => { e.stopPropagation(); remove.mutate(s.id); }}
                    >delete</button>
                  </div>
                </div>

                {/* 4 corner circles */}
                {([0, 1, 2, 3] as const).map((ci) => {
                  const positions = [
                    { left: -5, top: -5 },
                    { right: -5, top: -5 },
                    { left: -5, bottom: -5 },
                    { right: -5, bottom: -5 },
                  ] as const;
                  const { cornerCount } = capFor(s.id, ci);
                  const dimmed = cornerCount >= 3;
                  return (
                    <div
                      key={ci}
                      data-corner="true"
                      className={`absolute h-3 w-3 rounded-full border-2 ${dimmed ? "border-muted-foreground bg-muted" : "border-accent bg-background"}`}
                      style={{ ...positions[ci] }}
                      onPointerDown={(e) => handleCornerPointerDown(e, s.id)}
                    />
                  );
                })}
              </div>
            );
          })}

          {/* Links */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {links.map((l) => {
              const source = stormLookup.get(l.sourceId);
              const target = stormLookup.get(l.targetId);
              if (!source || !target) return null;
              const corners = [
                { x: source.positionX, y: source.positionY },
                { x: source.positionX + CANVAS_CARD_W, y: source.positionY },
                { x: source.positionX, y: source.positionY + CANVAS_CARD_H },
                { x: source.positionX + CANVAS_CARD_W, y: source.positionY + CANVAS_CARD_H },
              ];
              const tcorners = [
                { x: target.positionX, y: target.positionY },
                { x: target.positionX + CANVAS_CARD_W, y: target.positionY },
                { x: target.positionX, y: target.positionY + CANVAS_CARD_H },
                { x: target.positionX + CANVAS_CARD_W, y: target.positionY + CANVAS_CARD_H },
              ];
              const from = corners[l.sourceCorner];
              const to = tcorners[l.targetCorner];
              return (
                <line key={l.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor" strokeWidth={2} className="text-accent" />
              );
            })}
            {linking && (() => {
              const source = stormLookup.get(linking.stormId);
              if (!source) return null;
              const corners = [
                { x: source.positionX, y: source.positionY },
                { x: source.positionX + CANVAS_CARD_W, y: source.positionY },
                { x: source.positionX, y: source.positionY + CANVAS_CARD_H },
                { x: source.positionX + CANVAS_CARD_W, y: source.positionY + CANVAS_CARD_H },
              ];
              const from = corners[linking.corner];
              const rect = canvasRef.current?.getBoundingClientRect();
              const to = rect ? toCanvas(linking.mouseX, linking.mouseY) : from;
              return <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor" strokeWidth={2} className="text-critical" />;
            })()}
          </svg>
        </div>
      </div>

      {draftName && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80">
          <div className="w-80 space-y-2 border-2 border-outline bg-surface p-3">
            <div className="text-sm font-bold">New storm</div>
            <input
              autoFocus
              className="w-full border-2 border-outline bg-background px-2 py-1.5 text-sm"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const name = draftName.trim();
                  if (!name) return;
                  create.mutate(name, {
                    onSuccess: ({ storm }: { storm: { id: string } }) => {
                      queryClient.invalidateQueries({ queryKey: ["storms"] });
                      setDraftName("");
                      navigate(`${STORM_ROUTES.HOME}/${storm.id}/note`);
                    },
                  });
                }
                if (e.key === "Escape") setDraftName("");
              }}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setDraftName("")}>Cancel</Button>
              <Button size="sm" onClick={() => {
                const name = draftName.trim();
                if (!name) return;
                create.mutate(name, {
                  onSuccess: ({ storm }: { storm: { id: string } }) => {
                    queryClient.invalidateQueries({ queryKey: ["storms"] });
                    setDraftName("");
                    navigate(`${STORM_ROUTES.HOME}/${storm.id}/note`);
                  },
                });
              }}>Create</Button>
            </div>
            {create.isError && <p className="text-xs text-critical">{(create.error as Error).message}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
