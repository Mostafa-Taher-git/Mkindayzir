/**
 * Pure-function math for the Storm canvas: corner geometry, link caps,
 * subtree reachability, drag translations, pan clamps, and fit-to-view.
 */

export type StormCard = {
  id: string;
  name: string;
  positionX: number;
  positionY: number;
  isArchived: boolean;
};

export type StormLink = {
  id: string;
  sourceId: string;
  sourceCorner: number;
  targetId: string;
  targetCorner: number;
};

export type Viewport = { width: number; height: number };
export type Camera = { x: number; y: number; zoom: number };

export const CARD_W = 200;
export const CARD_H = 120;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
// Hard world bound so a corrupted/absurd stored position can never produce a
// ~300k-px-wide element that hangs or crashes the browser renderer.
export const WORLD_LIMIT = 50000;

/** Clamp a single stored coordinate to the safe world bound. */
export function clampCoord(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(WORLD_LIMIT, Math.max(-WORLD_LIMIT, n));
}

/** Return a copy of `storms` with every position clamped to the safe world. */
export function sanitizeStormPositions<T extends StormCard>(storms: ReadonlyArray<T>): T[] {
  return storms.map((s) => ({
    ...s,
    positionX: clampCoord(s.positionX),
    positionY: clampCoord(s.positionY),
  }));
}
export const CORNERS_PER_CARD = 3;
export const LINKS_PER_CARD = 12;
export const PADDING = 80;

export type LinkCaps = { cornerCount: number; stormCount: number };

/** World-space centre coordinates of the four corner handles of a card. */
export function cardCorners(card: StormCard): ReadonlyArray<{ x: number; y: number }> {
  return [
    { x: card.positionX, y: card.positionY },
    { x: card.positionX + CARD_W, y: card.positionY },
    { x: card.positionX, y: card.positionY + CARD_H },
    { x: card.positionX + CARD_W, y: card.positionY + CARD_H },
  ];
}

/** Index (0..3) of the corner of `card` closest to the world point (cx, cy). */
export function nearestCorner(card: StormCard, cx: number, cy: number): number {
  const corners = cardCorners(card);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < corners.length; i++) {
    const c = corners[i];
    const d = (c.x - cx) ** 2 + (c.y - cy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** How many links already touch a given corner and a given card overall. */
export function linkCapsAtCorner(
  storms: ReadonlyArray<StormCard>,
  links: ReadonlyArray<StormLink>,
  stormId: string,
  corner: number
): LinkCaps {
  const exists = storms.some((s) => s.id === stormId);
  if (!exists) return { cornerCount: 0, stormCount: 0 };
  let cornerCount = 0;
  let stormCount = 0;
  for (const l of links) {
    const atThisCorner =
      (l.sourceId === stormId && l.sourceCorner === corner) ||
      (l.targetId === stormId && l.targetCorner === corner);
    if (atThisCorner) cornerCount++;
    if (l.sourceId === stormId || l.targetId === stormId) stormCount++;
  }
  return { cornerCount, stormCount };
}

/** Whether a new link from one card corner to another is allowed by the caps. */
export function canCreateLink(
  storms: ReadonlyArray<StormCard>,
  links: ReadonlyArray<StormLink>,
  sourceId: string,
  sourceCorner: number,
  targetId: string,
  targetCorner: number
): boolean {
  if (sourceId === targetId) return false;
  const duplicate = links.some(
    (l) =>
      l.sourceId === sourceId &&
      l.sourceCorner === sourceCorner &&
      l.targetId === targetId &&
      l.targetCorner === targetCorner
  );
  if (duplicate) return false;
  const s = linkCapsAtCorner(storms, links, sourceId, sourceCorner);
  const t = linkCapsAtCorner(storms, links, targetId, targetCorner);
  if (s.cornerCount >= CORNERS_PER_CARD) return false;
  if (s.stormCount >= LINKS_PER_CARD) return false;
  if (t.cornerCount >= CORNERS_PER_CARD) return false;
  if (t.stormCount >= LINKS_PER_CARD) return false;
  return true;
}

/** Card whose rect is nearest (by squared outside distance) to a world point, or null. */
export function nearestCardToPoint(
  storms: ReadonlyArray<StormCard>,
  cx: number,
  cy: number
): { id: string; x: number; y: number } | null {
  let best: { id: string; x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const s of storms) {
    const dx = Math.max(s.positionX - cx, 0, cx - (s.positionX + CARD_W));
    const dy = Math.max(s.positionY - cy, 0, cy - (s.positionY + CARD_H));
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = { id: s.id, x: s.positionX, y: s.positionY };
    }
  }
  return best;
}

/** All card ids transitively reachable from `rootId` through the link graph (root included). */
export function collectSubtree(rootId: string, links: ReadonlyArray<StormLink>): Set<string> {
  const result = new Set<string>([rootId]);
  const adjacency = new Map<string, Set<string>>();
  for (const l of links) {
    let a = adjacency.get(l.sourceId);
    if (!a) {
      a = new Set<string>();
      adjacency.set(l.sourceId, a);
    }
    a.add(l.targetId);
    let b = adjacency.get(l.targetId);
    if (!b) {
      b = new Set<string>();
      adjacency.set(l.targetId, b);
    }
    b.add(l.sourceId);
  }
  const stack: string[] = [rootId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    const neighbours = adjacency.get(current);
    if (!neighbours) continue;
    for (const n of neighbours) {
      if (!result.has(n)) {
        result.add(n);
        stack.push(n);
      }
    }
  }
  return result;
}

/** New storms array with the listed cards translated by (dx, dy); non-subtree cards unchanged. */
export function moveStorms(
  storms: ReadonlyArray<StormCard>,
  subtreeIds: ReadonlySet<string>,
  dx: number,
  dy: number
): StormCard[] {
  if (dx === 0 && dy === 0) return storms.slice();
  return storms.map((s) => {
    if (!subtreeIds.has(s.id)) return s;
    return {
      ...s,
      positionX: s.positionX + dx,
      positionY: s.positionY + dy,
    };
  });
}

export type Pan = { x: number; y: number };

/** Pan adjusted so the bounding box of all cards stays at least partly on-screen with `padding`. */
export function clampPan(
  pan: Pan,
  zoom: number,
  viewport: Viewport,
  storms: ReadonlyArray<StormCard>,
  cardW: number = CARD_W,
  cardH: number = CARD_H,
  padding: number = PADDING
): Pan {
  if (storms.length === 0) {
    if (pan.x === 0 && pan.y === 0) return pan;
    return { x: 0, y: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of storms) {
    if (s.positionX < minX) minX = s.positionX;
    if (s.positionY < minY) minY = s.positionY;
    const right = s.positionX + cardW;
    if (right > maxX) maxX = right;
    const bottom = s.positionY + cardH;
    if (bottom > maxY) maxY = bottom;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return pan;
  }
  const visibleLeft = -pan.x / zoom;
  const visibleTop = -pan.y / zoom;
  const visibleRight = visibleLeft + viewport.width / zoom;
  const visibleBottom = visibleTop + viewport.height / zoom;
  const overlapX = visibleRight > minX && visibleLeft < maxX;
  const overlapY = visibleBottom > minY && visibleTop < maxY;
  if (overlapX && overlapY) return pan;
  const minPanX = viewport.width - maxX * zoom - padding;
  const maxPanX = -minX * zoom + padding;
  const minPanY = viewport.height - maxY * zoom - padding;
  const maxPanY = -minY * zoom + padding;
  if (minPanX > maxPanX || minPanY > maxPanY) return pan;
  const clampedX = Math.min(maxPanX, Math.max(minPanX, pan.x));
  const clampedY = Math.min(maxPanY, Math.max(minPanY, pan.y));
  return { x: clampedX, y: clampedY };
}

export type FitViewResult = { zoom: number; pan: Pan };

/** Camera (zoom, pan) that frames all cards inside `viewport` with `padding`, zoom clamped. */
export function computeFitView(
  storms: ReadonlyArray<StormCard>,
  cardW: number,
  cardH: number,
  viewport: Viewport,
  padding: number = PADDING,
  minZoom: number = MIN_ZOOM,
  maxZoom: number = MAX_ZOOM
): FitViewResult {
  if (storms.length === 0 || viewport.width <= 0 || viewport.height <= 0) {
    return { zoom: 1, pan: { x: 0, y: 0 } };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of storms) {
    if (s.positionX < minX) minX = s.positionX;
    if (s.positionY < minY) minY = s.positionY;
    const right = s.positionX + cardW;
    if (right > maxX) maxX = right;
    const bottom = s.positionY + cardH;
    if (bottom > maxY) maxY = bottom;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { zoom: 1, pan: { x: 0, y: 0 } };
  }
  const w = maxX - minX || cardW;
  const h = maxY - minY || cardH;
  const availableW = Math.max(1, viewport.width - padding * 2);
  const availableH = Math.max(1, viewport.height - padding * 2);
  const raw = Math.min(availableW / w, availableH / h);
  const zoom = Math.min(maxZoom, Math.max(minZoom, raw));
  const pan: Pan = {
    x: viewport.width / 2 - (minX + w / 2) * zoom,
    y: viewport.height / 2 - (minY + h / 2) * zoom,
  };
  return { zoom, pan };
}
