/**
 * Storm canvas: pan/zoom, fixed-size cards, 4 corner circles,
 * drag-with-subtree, link creation, cap enforcement, create-anywhere,
 * fit-to-view. A plain click on a card opens its note; a drag moves it.
 *
 * Why a native non-passive wheel listener: React's onWheel is registered
 * as a passive listener at the root, so preventDefault() is a no-op and the
 * page scrolls under the canvas. We attach a manual addEventListener with
 * { passive: false } on the canvas div to suppress page scroll while zooming.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  useStorms, useCreateStorm, useDeleteStorm, useUpdateStorm,
  useCreateLink, useDeleteLink, useMoveSubtree,
} from "@/hooks/use-storms";
import { STORM_ROUTES } from "@/lib/constants";
import {
  CARD_W, CARD_H, MAX_ZOOM, MIN_ZOOM,
  cardCorners, nearestCorner, linkCapsAtCorner, canCreateLink,
  nearestCardToPoint, collectSubtree, clampPan, computeFitView,
  type StormCard, type StormLink, type Pan,
} from "@/features/storm/canvas-math";

type Linking = { stormId: string; corner: number; mouseX: number; mouseY: number };
type Drag = { stormId: string; originX: number; originY: number; subtreeIds: Set<string> };
type Delta = { dx: number; dy: number };
type CardPress = { x: number; y: number; moved: boolean; id: string };
const CLICK_THRESHOLD = 4; // px of movement below which a press counts as a click
const CORNER_STYLES = [
  { left: -5, top: -5 }, { right: -5, top: -5 },
  { left: -5, bottom: -5 }, { right: -5, bottom: -5 },
] as const;

export default function StormPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useStorms();
  const create = useCreateStorm();
  const remove = useDeleteStorm();
  const update = useUpdateStorm();
  const createLink = useCreateLink();
  const deleteLink = useDeleteLink();
  const moveSubtree = useMoveSubtree();

  const storms = React.useMemo<StormCard[]>(
    () => (Array.isArray(data?.storms) ? (data.storms as StormCard[]) : []), [data]
  );
  const links = React.useMemo<StormLink[]>(
    () => (Array.isArray(data?.links) ? (data.links as StormLink[]) : []), [data]
  );

  const canvasRef = React.useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState<Pan>({ x: 0, y: 0 });
  // null = modal closed, "" = modal open with empty name (user types their own).
  const [draftName, setDraftName] = React.useState<string | null>(null);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameText, setRenameText] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = React.useState<string | null>(null);
  const [linking, setLinking] = React.useState<Linking | null>(null);
  const [isPanning, setIsPanning] = React.useState(false);
  const [panStart, setPanStart] = React.useState({ x: 0, y: 0, mx: 0, my: 0 });
  const [drag, setDrag] = React.useState<Drag | null>(null);
  // Per-card live offset during a drag. Reset on pointer-up; the final delta
  // is persisted via useMoveSubtree so the server repositions the whole subtree.
  const [dragDelta, setDragDelta] = React.useState<Map<string, Delta>>(new Map());
  const bgPress = React.useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const cardPress = React.useRef<CardPress | null>(null);

  const viewport = React.useCallback((): { width: number; height: number } => {
    const r = canvasRef.current?.getBoundingClientRect();
    return r ? { width: r.width, height: r.height } : { width: 0, height: 0 };
  }, []);

  // Re-clamp whenever storms or zoom change so the user can never drag the
  // whole graph off-screen entirely.
  React.useEffect(() => {
    setPan((p) => clampPan(p, zoom, viewport(), storms));
  }, [storms, zoom, viewport]);

  // Non-passive wheel listener: React's synthetic onWheel is always passive.
  React.useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)));
      setPan((p) => ({ x: mx - (mx - p.x) * factor, y: my - (my - p.y) * factor }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const openNote = React.useCallback(
    (stormId: string) => navigate(`${STORM_ROUTES.HOME}/${stormId}/note`),
    [navigate]
  );

  const toCanvas = React.useCallback(
    (clientX: number, clientY: number) => {
      const r = canvasRef.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return { x: (clientX - r.left - pan.x) / zoom, y: (clientY - r.top - pan.y) / zoom };
    },
    [pan, zoom]
  );

  const onCanvasDown = (e: React.PointerEvent) => {
    // Middle-button or Alt+left always pans.
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setPanStart({ x: pan.x, y: pan.y, mx: e.clientX, my: e.clientY });
      canvasRef.current?.setPointerCapture?.(e.pointerId);
      return;
    }
    // Plain left press on empty background: may become a click-to-create
    // (no movement) or a drag-to-pan (movement past threshold).
    if (e.button === 0 && !(e.target as HTMLElement).closest('[data-testid="card"]')) {
      bgPress.current = { x: e.clientX, y: e.clientY, moved: false };
      canvasRef.current?.setPointerCapture?.(e.pointerId);
    }
  };

  const onCanvasMove = (e: React.PointerEvent) => {
    if (isPanning) {
      setPan({ x: panStart.x + (e.clientX - panStart.mx), y: panStart.y + (e.clientY - panStart.my) });
      return;
    }
    if (drag) {
      const p = toCanvas(e.clientX, e.clientY);
      const cur = storms.find((s) => s.id === drag.stormId);
      const dx = p.x - drag.originX - (cur?.positionX ?? drag.originX);
      const dy = p.y - drag.originY - (cur?.positionY ?? drag.originY);
      setDragDelta((prev) => {
        const next = new Map(prev);
        drag.subtreeIds.forEach((id) => {
          const c = next.get(id) ?? { dx: 0, dy: 0 };
          next.set(id, { dx: c.dx + dx, dy: c.dy + dy });
        });
        return next;
      });
      // Only count it as a drag once movement passes the click threshold;
      // a stray same-coordinate pointermove must not swallow a click.
      const moved = Math.hypot(e.clientX - (cardPress.current?.x ?? e.clientX), e.clientY - (cardPress.current?.y ?? e.clientY)) > CLICK_THRESHOLD;
      if (cardPress.current) cardPress.current.moved = moved;
      setDrag((d) => (d ? { ...d, originX: p.x - dx, originY: p.y - dy } : d));
      return;
    }
    if (linking) {
      setLinking({ ...linking, mouseX: e.clientX, mouseY: e.clientY });
      return;
    }
    if (bgPress.current) {
      const moved = Math.hypot(e.clientX - bgPress.current.x, e.clientY - bgPress.current.y) > CLICK_THRESHOLD;
      if (moved) {
        bgPress.current.moved = true;
        setIsPanning(true);
        setPanStart({ x: pan.x, y: pan.y, mx: bgPress.current.x, my: bgPress.current.y });
      }
    }
  };

  const onCanvasUp = (e: React.PointerEvent) => {
    if (linking) {
      const p = toCanvas(e.clientX, e.clientY);
      const target = nearestCardToPoint(storms, p.x, p.y);
      if (target) {
        const tc = storms.find((s) => s.id === target.id);
        if (tc) {
          const tCorner = nearestCorner(tc, p.x, p.y);
          if (canCreateLink(storms, links, linking.stormId, linking.corner, target.id, tCorner)) {
            createLink.mutate({
              sourceId: linking.stormId, targetId: target.id,
              sourceCorner: linking.corner, targetCorner: tCorner,
            });
          }
        }
      }
      setLinking(null);
      return;
    }
    if (drag) {
      const root = dragDelta.get(drag.stormId) ?? { dx: 0, dy: 0 };
      // No movement past the threshold ⇒ treat the press as a click → open note.
      if (!cardPress.current?.moved) {
        openNote(drag.stormId);
      } else if (root.dx !== 0 || root.dy !== 0) {
        moveSubtree.mutate({ stormId: drag.stormId, dx: root.dx, dy: root.dy });
      }
      setDragDelta(new Map());
    }
    if (bgPress.current) {
      // A background press that never moved is a click → open the create box.
      if (!bgPress.current.moved) setDraftName("");
      bgPress.current = null;
    }
    cardPress.current = null;
    setIsPanning(false);
    setDrag(null);
  };

  const onCornerDown = (e: React.PointerEvent, stormId: string) => {
    e.stopPropagation();
    const card = storms.find((s) => s.id === stormId);
    if (!card) return;
    const p = toCanvas(e.clientX, e.clientY);
    const corner = nearestCorner(card, p.x, p.y);
    if (linkCapsAtCorner(storms, links, stormId, corner).cornerCount >= 3) return;
    setLinking({ stormId, corner, mouseX: e.clientX, mouseY: e.clientY });
    canvasRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onCardDown = (e: React.PointerEvent, storm: StormCard) => {
    if (e.button !== 0) return;
    // Corner circles have data-corner="true"; don't start a card drag from them.
    if ((e.target as HTMLElement).dataset.corner === "true") return;
    e.stopPropagation();
    cardPress.current = { x: e.clientX, y: e.clientY, moved: false, id: storm.id };
    setDrag({
      stormId: storm.id,
      originX: storm.positionX, originY: storm.positionY,
      subtreeIds: collectSubtree(storm.id, links),
    });
    setSelectedId(storm.id);
    setSelectedLinkId(null);
    canvasRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onFitView = () => {
    const next = computeFitView(storms, CARD_W, CARD_H, viewport());
    setZoom(next.zoom);
    setPan(next.pan);
  };

  const startRename = (s: { id: string; name: string }) => {
    setRenamingId(s.id);
    setRenameText(s.name);
  };
  const commitRename = () => {
    if (!renamingId) return;
    const name = renameText.trim();
    if (name) update.mutate({ id: renamingId, patch: { name } });
    setRenamingId(null);
  };
  const confirmDelete = (id: string) => {
    if (window.confirm("Delete this storm?")) remove.mutate(id);
  };
  const submitNew = () => {
    const name = (draftName ?? "").trim();
    if (!name) return;
    create.mutate(name, {
      onSuccess: ({ storm }: { storm: { id: string } }) => {
        setDraftName(null);
        navigate(`${STORM_ROUTES.HOME}/${storm.id}/note`);
      },
    });
  };

  if (isLoading) {
    return <div className="flex h-[calc(100vh-4rem)] w-full items-center justify-center">Loading…</div>;
  }

  // Live corner of a card, offset by the current drag delta.
  const cornerOf = (card: StormCard, idx: number) => {
    const d = dragDelta.get(card.id);
    const c = cardCorners(card)[idx];
    return { x: c.x + (d?.dx ?? 0), y: c.y + (d?.dy ?? 0) };
  };
  const stormLookup = new Map(storms.map((s) => [s.id, s]));
  const createErrorMsg = create.error instanceof Error ? create.error.message : null;

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col">
      <div className="flex items-center justify-between border-b-2 border-outline-strong px-4 py-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold">Storm</h1>
          <span className="text-xs text-muted-foreground">mind map</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onFitView} data-testid="fit-view-button" aria-label="Fit view">Fit view</Button>
          <Button size="sm" onClick={() => setDraftName("")} data-testid="new-storm-button" aria-label="New storm">+ New</Button>
        </div>
      </div>

      <div
        ref={canvasRef} data-testid="canvas"
        className="relative flex-1 overflow-hidden bg-background"
        onPointerDown={onCanvasDown} onPointerMove={onCanvasMove} onPointerUp={onCanvasUp}
      >
        <div className="absolute inset-0"
             style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
          {storms.filter((s) => !s.isArchived).map((s) => {
            const d = dragDelta.get(s.id);
            return (
              <div key={s.id} data-testid="card"
                   className={`absolute rounded-xl border-2 bg-surface p-2 shadow-lg select-none ${selectedId === s.id ? "border-accent" : "border-outline"}`}
                   style={{ left: s.positionX + (d?.dx ?? 0), top: s.positionY + (d?.dy ?? 0), width: CARD_W, height: CARD_H }}
                   onPointerDown={(e) => onCardDown(e, s)}
                   onDoubleClick={() => openNote(s.id)}>
                <div className="flex h-full flex-col">
                  {renamingId === s.id ? (
                    <input autoFocus data-testid="rename-input" aria-label="Rename storm"
                           className="h-full w-full bg-transparent text-sm outline-none"
                           value={renameText}
                           onChange={(e) => setRenameText(e.target.value)}
                           onBlur={commitRename}
                           onKeyDown={(e) => {
                             if (e.key === "Enter") commitRename();
                             if (e.key === "Escape") setRenamingId(null);
                           }}
                           onClick={(e) => e.stopPropagation()} />
                  ) : (
                    <div data-testid="card-name" className="line-clamp-3 text-sm" title={s.name}>{s.name}</div>
                  )}
                  <div className="mt-auto flex items-center justify-between text-[10px] text-muted-foreground">
                    <button className="underline" aria-label="Rename" onClick={(e) => { e.stopPropagation(); startRename(s); }}>rename</button>
                    <button className="underline" data-testid="delete-card-button" aria-label="Delete storm"
                            onClick={(e) => { e.stopPropagation(); confirmDelete(s.id); }}>delete</button>
                  </div>
                </div>
                {([0, 1, 2, 3] as const).map((ci) => (
                  <div key={ci} data-corner="true" data-testid="corner" aria-label={`Corner ${ci + 1}`}
                       className={`absolute h-3 w-3 rounded-full border-2 ${linkCapsAtCorner(storms, links, s.id, ci).cornerCount >= 3 ? "border-muted-foreground bg-muted" : "border-accent bg-background"}`}
                       style={CORNER_STYLES[ci]}
                       onPointerDown={(e) => onCornerDown(e, s.id)} />
                ))}
              </div>
            );
          })}

          {/* Links: the SVG must be click-through so the corner handles and
              cards underneath stay interactive. Only the link lines and their
              delete buttons capture pointer events (set per-element below). */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
            {links.map((l) => {
              const src = stormLookup.get(l.sourceId), tgt = stormLookup.get(l.targetId);
              if (!src || !tgt) return null;
              const from = cornerOf(src, l.sourceCorner), to = cornerOf(tgt, l.targetCorner);
              const sel = selectedLinkId === l.id;
              return (
                <g key={l.id} data-testid="link-line" className="pointer-events-auto" style={{ cursor: "pointer" }}
                   onClick={(e) => { e.stopPropagation(); setSelectedLinkId(l.id); }}>
                  {/* Wide transparent overlay (14px) makes lines easy to click. */}
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="transparent" strokeWidth={14} />
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor"
                        strokeWidth={sel ? 3 : 2} className="text-accent" pointerEvents="none" />
                  {sel && (
                    <g style={{ cursor: "pointer" }}
                       onClick={(e) => {
                         e.stopPropagation();
                         deleteLink.mutate({ stormId: l.sourceId, linkId: l.id });
                         setSelectedLinkId(null);
                       }}>
                      <circle cx={(from.x + to.x) / 2} cy={(from.y + to.y) / 2} r={9}
                              fill="currentColor" className="text-critical" pointerEvents="all" />
                      <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2} textAnchor="middle"
                            dominantBaseline="central" fontSize={12} fontWeight="bold" fill="white" pointerEvents="none">×</text>
                    </g>
                  )}
                </g>
              );
            })}
            {linking && (() => {
              const src = stormLookup.get(linking.stormId);
              if (!src) return null;
              const from = cornerOf(src, linking.corner);
              const to = toCanvas(linking.mouseX, linking.mouseY);
              return <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor" strokeWidth={2}
                           className="text-critical" pointerEvents="none" />;
            })()}
          </svg>
        </div>
      </div>

      {draftName !== null && (
        <div data-testid="new-storm-modal" className="absolute inset-0 z-50 flex items-center justify-center bg-background/80">
          <div className="w-80 space-y-2 border-2 border-outline bg-surface p-3">
            <div className="text-sm font-bold">New storm</div>
            <input autoFocus data-testid="new-storm-input" aria-label="Storm name"
                   className="w-full border-2 border-outline bg-background px-2 py-1.5 text-sm"
                   value={draftName}
                   onChange={(e) => setDraftName(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key === "Enter") submitNew();
                     if (e.key === "Escape") setDraftName(null);
                   }} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setDraftName(null)} aria-label="Cancel">Cancel</Button>
              <Button size="sm" data-testid="create-storm-button" onClick={submitNew} aria-label="Create storm">Create</Button>
            </div>
            {create.isError && <p className="text-xs text-critical">{createErrorMsg ?? "Failed"}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
