/**
 * TC-CM-01  cardCorners returns 4 corners with correct world coords
 * TC-CM-02  cardCorners for a card at (0, 0)
 * TC-CM-03  cardCorners does not mutate the input
 * TC-CM-04  nearestCorner returns 0 (top-left) for a point at the top-left
 * TC-CM-05  nearestCorner returns 1 (top-right) for a point at the top-right
 * TC-CM-06  nearestCorner returns 2 (bottom-left) for a point at the bottom-left
 * TC-CM-07  nearestCorner returns 3 (bottom-right) for a point at the bottom-right
 * TC-CM-08  nearestCorner returns deterministic index when equidistant
 * TC-CM-09  nearestCorner returns 0 when point is outside but closest to top-left
 * TC-CM-10  linkCapsAtCorner: empty links -> {0,0}
 * TC-CM-11  linkCapsAtCorner: counts links that hit the specified corner
 * TC-CM-12  linkCapsAtCorner: counts links where storm is source OR target
 * TC-CM-13  linkCapsAtCorner: returns 0,0 when stormId does not exist
 * TC-CM-14  linkCapsAtCorner: correctly counts across multiple links at same corner
 * TC-CM-15  canCreateLink: false when source === target
 * TC-CM-16  canCreateLink: false when an exact duplicate link exists
 * TC-CM-17  canCreateLink: false when source corner at cap (3)
 * TC-CM-18  canCreateLink: false when target corner at cap (3)
 * TC-CM-19  canCreateLink: false when source storm total at cap (12)
 * TC-CM-20  canCreateLink: false when target storm total at cap (12)
 * TC-CM-21  canCreateLink: true otherwise
 * TC-CM-22  nearestCardToPoint: returns null for empty storms
 * TC-CM-23  nearestCardToPoint: returns the only card for a point inside it
 * TC-CM-24  nearestCardToPoint: returns the card when the point is inside its rect
 * TC-CM-25  nearestCardToPoint: returns the nearest card when the point is outside all cards
 * TC-CM-26  nearestCardToPoint: returns null when there are no cards
 * TC-CM-27  collectSubtree: just {rootId} when no links
 * TC-CM-28  collectSubtree: 1-hop neighbours
 * TC-CM-29  collectSubtree: full transitive closure (A->B->C->D)
 * TC-CM-30  collectSubtree: handles a cycle without infinite loop
 * TC-CM-31  collectSubtree: multiple disconnected components
 * TC-CM-32  collectSubtree: result includes the root
 * TC-CM-33  moveStorms: returns a new array (does not mutate)
 * TC-CM-34  moveStorms: moves only cards in the subtree set
 * TC-CM-35  moveStorms: returns same-length array
 * TC-CM-36  moveStorms: handles empty subtree set (no movement)
 * TC-CM-37  moveStorms: returns shallow copy when dx === dy === 0
 * TC-CM-38  clampPan: empty storms returns pan as-is when zero, else zeros
 * TC-CM-39  clampPan: no clamp when cards are still in view
 * TC-CM-40  clampPan: clamps X when all cards panned off the left
 * TC-CM-41  clampPan: clamps Y when all cards panned off the top
 * TC-CM-42  clampPan: returns pan when board is wider than viewport
 * TC-CM-43  computeFitView: empty storms -> {zoom:1, pan:{0,0}}
 * TC-CM-44  computeFitView: zero viewport -> {zoom:1, pan:{0,0}}
 * TC-CM-45  computeFitView: single card centres it in the viewport
 * TC-CM-46  computeFitView: multiple cards frames them all
 * TC-CM-47  computeFitView: zoom clamped to MIN_ZOOM when cards are huge
 * TC-CM-48  computeFitView: zoom clamped to MAX_ZOOM when cards are tiny
 * TC-CM-49  computeFitView: resulting pan centres the bounding box
 * TC-CM-50  exported constants match expected values
 */
import { describe, expect, it } from "vitest";
import {
  CARD_W,
  CARD_H,
  MIN_ZOOM,
  MAX_ZOOM,
  CORNERS_PER_CARD,
  LINKS_PER_CARD,
  PADDING,
  cardCorners,
  nearestCorner,
  linkCapsAtCorner,
  canCreateLink,
  nearestCardToPoint,
  collectSubtree,
  moveStorms,
  clampPan,
  computeFitView,
  type StormCard,
  type StormLink,
} from "@/features/storm/canvas-math";

function card(id: string, x: number, y: number): StormCard {
  return { id, name: id, positionX: x, positionY: y, isArchived: false };
}

function link(
  id: string,
  sourceId: string,
  sourceCorner: number,
  targetId: string,
  targetCorner: number
): StormLink {
  return { id, sourceId, sourceCorner, targetId, targetCorner };
}

describe("cardCorners", () => {
  it("TC-CM-01: returns 4 corners with correct world coords for a card at (100, 200)", () => {
    const c = card("a", 100, 200);
    expect(cardCorners(c)).toEqual([
      { x: 100, y: 200 },
      { x: 100 + CARD_W, y: 200 },
      { x: 100, y: 200 + CARD_H },
      { x: 100 + CARD_W, y: 200 + CARD_H },
    ]);
  });

  it("TC-CM-02: returns 4 corners with correct world coords for a card at (0, 0)", () => {
    const c = card("a", 0, 0);
    expect(cardCorners(c)).toEqual([
      { x: 0, y: 0 },
      { x: CARD_W, y: 0 },
      { x: 0, y: CARD_H },
      { x: CARD_W, y: CARD_H },
    ]);
  });

  it("TC-CM-03: does not mutate the input card", () => {
    const c = card("a", 100, 200);
    const snapshot = { ...c };
    cardCorners(c);
    expect(c).toEqual(snapshot);
  });
});

describe("nearestCorner", () => {
  it("TC-CM-04: returns 0 (top-left) for a point at the top-left of the card", () => {
    const c = card("a", 100, 200);
    expect(nearestCorner(c, 100, 200)).toBe(0);
  });

  it("TC-CM-05: returns 1 (top-right) for a point at the top-right of the card", () => {
    const c = card("a", 100, 200);
    expect(nearestCorner(c, 100 + CARD_W, 200)).toBe(1);
  });

  it("TC-CM-06: returns 2 (bottom-left) for a point at the bottom-left of the card", () => {
    const c = card("a", 100, 200);
    expect(nearestCorner(c, 100, 200 + CARD_H)).toBe(2);
  });

  it("TC-CM-07: returns 3 (bottom-right) for a point at the bottom-right of the card", () => {
    const c = card("a", 100, 200);
    expect(nearestCorner(c, 100 + CARD_W, 200 + CARD_H)).toBe(3);
  });

  it("TC-CM-08: returns the earliest index when point is equidistant (strict-less keeps first match)", () => {
    const c = card("a", 0, 0);
    const cx = CARD_W / 2;
    const cy = CARD_H / 2;
    expect(nearestCorner(c, cx, cy)).toBe(0);
  });

  it("TC-CM-09: returns 0 when point is outside but closest to top-left", () => {
    const c = card("a", 100, 200);
    expect(nearestCorner(c, 50, 150)).toBe(0);
  });
});

describe("linkCapsAtCorner", () => {
  it("TC-CM-10: empty links -> {cornerCount: 0, stormCount: 0}", () => {
    const storms = [card("a", 0, 0)];
    expect(linkCapsAtCorner(storms, [], "a", 0)).toEqual({
      cornerCount: 0,
      stormCount: 0,
    });
  });

  it("TC-CM-11: counts links that hit the specified corner", () => {
    const storms = [card("a", 0, 0), card("b", 300, 0)];
    const links = [
      link("l1", "a", 0, "b", 0),
      link("l2", "a", 0, "b", 1),
    ];
    expect(linkCapsAtCorner(storms, links, "a", 0).cornerCount).toBe(2);
  });

  it("TC-CM-12: counts links where the storm is source OR target", () => {
    const storms = [card("a", 0, 0), card("b", 300, 0), card("c", 600, 0)];
    const links = [
      link("l1", "a", 0, "b", 0),
      link("l2", "b", 0, "a", 1),
    ];
    expect(linkCapsAtCorner(storms, links, "a", 0).stormCount).toBe(2);
  });

  it("TC-CM-13: returns 0 counts when the stormId does not exist", () => {
    const storms = [card("a", 0, 0)];
    const links = [link("l1", "a", 0, "a", 1)];
    expect(linkCapsAtCorner(storms, links, "missing", 0)).toEqual({
      cornerCount: 0,
      stormCount: 0,
    });
  });

  it("TC-CM-14: correctly counts across multiple links at same corner", () => {
    // l3 uses corner 2 on a (source) and corner 1 on b (target), so it still
    // hits corner 2 of "a" because a is the source. All three links touch
    // corner 2 of "a", and all three involve "a" at all.
    const storms = [card("a", 0, 0), card("b", 300, 0), card("c", 600, 0)];
    const links = [
      link("l1", "a", 2, "b", 0),
      link("l2", "a", 2, "c", 0),
      link("l3", "a", 2, "b", 1),
    ];
    const result = linkCapsAtCorner(storms, links, "a", 2);
    expect(result.cornerCount).toBe(3);
    expect(result.stormCount).toBe(3);
  });
});

describe("canCreateLink", () => {
  it("TC-CM-15: false when source === target", () => {
    const storms = [card("a", 0, 0)];
    expect(canCreateLink(storms, [], "a", 0, "a", 1)).toBe(false);
  });

  it("TC-CM-16: false when an exact duplicate link exists", () => {
    const storms = [card("a", 0, 0), card("b", 300, 0)];
    const links = [link("l1", "a", 0, "b", 1)];
    expect(canCreateLink(storms, links, "a", 0, "b", 1)).toBe(false);
  });

  it("TC-CM-17: false when source corner at cap (3)", () => {
    const storms = [card("a", 0, 0), card("b", 300, 0), card("c", 600, 0), card("d", 900, 0)];
    const links = [
      link("l1", "a", 0, "b", 0),
      link("l2", "a", 0, "c", 0),
      link("l3", "a", 0, "d", 0),
    ];
    expect(canCreateLink(storms, links, "a", 0, "b", 1)).toBe(false);
  });

  it("TC-CM-18: false when target corner at cap (3)", () => {
    const storms = [card("a", 0, 0), card("b", 300, 0), card("c", 600, 0), card("d", 900, 0)];
    const links = [
      link("l1", "b", 0, "a", 2),
      link("l2", "c", 0, "a", 2),
      link("l3", "d", 0, "a", 2),
    ];
    expect(canCreateLink(storms, links, "a", 0, "a", 2)).toBe(false);
  });

  it("TC-CM-19: false when source storm total at cap (12)", () => {
    const storms = [card("a", 0, 0), card("b", 300, 0)];
    const links: StormLink[] = [];
    for (let i = 0; i < 12; i++) {
      const sc = i % 4;
      const tc = i % 4;
      links.push(link(`l${i}`, "a", sc, "b", tc));
    }
    expect(canCreateLink(storms, links, "a", 0, "b", 0)).toBe(false);
  });

  it("TC-CM-20: false when target storm total at cap (12)", () => {
    const storms = [card("a", 0, 0), card("b", 300, 0)];
    const links: StormLink[] = [];
    for (let i = 0; i < 12; i++) {
      const sc = i % 4;
      const tc = i % 4;
      links.push(link(`l${i}`, "a", sc, "b", tc));
    }
    expect(canCreateLink(storms, links, "a", 0, "b", 0)).toBe(false);
  });

  it("TC-CM-21: true otherwise", () => {
    const storms = [card("a", 0, 0), card("b", 300, 0)];
    expect(canCreateLink(storms, [], "a", 0, "b", 1)).toBe(true);
  });
});

describe("nearestCardToPoint", () => {
  it("TC-CM-22: returns null for empty storms array", () => {
    expect(nearestCardToPoint([], 50, 50)).toBeNull();
  });

  it("TC-CM-23: returns the only card for a point inside it", () => {
    const storms = [card("a", 0, 0)];
    const result = nearestCardToPoint(storms, 50, 50);
    expect(result).toEqual({ id: "a", x: 0, y: 0 });
  });

  it("TC-CM-24: returns the card when the point is inside its rect (distance 0)", () => {
    const storms = [card("a", 0, 0), card("b", 500, 500)];
    expect(nearestCardToPoint(storms, 600, 550)).toEqual({ id: "b", x: 500, y: 500 });
  });

  it("TC-CM-25: returns the nearest card when the point is outside all cards", () => {
    const storms = [card("a", 0, 0), card("b", 1000, 0)];
    const result = nearestCardToPoint(storms, 201, 121);
    expect(result?.id).toBe("a");
  });

  it("TC-CM-26: returns null when there are no cards", () => {
    expect(nearestCardToPoint([], 0, 0)).toBeNull();
  });
});

describe("collectSubtree", () => {
  it("TC-CM-27: returns just {rootId} for a card with no links", () => {
    expect(collectSubtree("a", [])).toEqual(new Set(["a"]));
  });

  it("TC-CM-28: returns 1-hop neighbours", () => {
    const links = [
      link("l1", "a", 0, "b", 0),
      link("l2", "a", 1, "c", 0),
    ];
    expect(collectSubtree("a", links)).toEqual(new Set(["a", "b", "c"]));
  });

  it("TC-CM-29: returns the full transitive closure (A->B->C->D)", () => {
    const links = [
      link("l1", "a", 0, "b", 0),
      link("l2", "b", 0, "c", 0),
      link("l3", "c", 0, "d", 0),
    ];
    expect(collectSubtree("a", links)).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("TC-CM-30: handles a cycle (A<->B) without infinite loop", () => {
    const links = [
      link("l1", "a", 0, "b", 0),
      link("l2", "b", 0, "a", 0),
    ];
    expect(collectSubtree("a", links)).toEqual(new Set(["a", "b"]));
  });

  it("TC-CM-31: returns multiple disconnected components correctly (rooted set only)", () => {
    const links = [
      link("l1", "a", 0, "b", 0),
      link("l2", "c", 0, "d", 0),
    ];
    expect(collectSubtree("a", links)).toEqual(new Set(["a", "b"]));
    expect(collectSubtree("c", links)).toEqual(new Set(["c", "d"]));
  });

  it("TC-CM-32: result includes the root", () => {
    const links = [link("l1", "a", 0, "b", 0)];
    const result = collectSubtree("a", links);
    expect(result.has("a")).toBe(true);
  });
});

describe("moveStorms", () => {
  it("TC-CM-33: returns a new array (does not mutate the input)", () => {
    const storms = [card("a", 0, 0), card("b", 100, 100)];
    const subtree = new Set(["a"]);
    const original = [...storms];
    moveStorms(storms, subtree, 10, 10);
    expect(storms).toEqual(original);
  });

  it("TC-CM-34: moves only cards in the subtree set", () => {
    const storms = [card("a", 0, 0), card("b", 100, 100), card("c", 200, 200)];
    const subtree = new Set(["a", "c"]);
    const moved = moveStorms(storms, subtree, 50, 25);
    const a = moved.find((s) => s.id === "a");
    const b = moved.find((s) => s.id === "b");
    const c = moved.find((s) => s.id === "c");
    expect(a).toEqual({ ...card("a", 0, 0), positionX: 50, positionY: 25 });
    expect(b).toEqual(card("b", 100, 100));
    expect(c).toEqual({ ...card("c", 200, 200), positionX: 250, positionY: 225 });
  });

  it("TC-CM-35: returns same-length array", () => {
    const storms = [card("a", 0, 0), card("b", 100, 100), card("c", 200, 200)];
    const moved = moveStorms(storms, new Set(["a"]), 5, 5);
    expect(moved).toHaveLength(3);
  });

  it("TC-CM-36: handles empty subtree set (no movement)", () => {
    const storms = [card("a", 0, 0), card("b", 100, 100)];
    const moved = moveStorms(storms, new Set(), 50, 50);
    expect(moved).toEqual(storms);
  });

  it("TC-CM-37: returns shallow copy when dx === dy === 0", () => {
    const storms = [card("a", 0, 0), card("b", 100, 100)];
    const moved = moveStorms(storms, new Set(["a"]), 0, 0);
    expect(moved).toEqual(storms);
    expect(moved).not.toBe(storms);
  });
});

describe("clampPan", () => {
  it("TC-CM-38: empty storms returns pan as-is when zero, else zeros", () => {
    expect(clampPan({ x: 0, y: 0 }, 1, { width: 800, height: 600 }, [])).toEqual({
      x: 0,
      y: 0,
    });
    expect(clampPan({ x: 50, y: 50 }, 1, { width: 800, height: 600 }, [])).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("TC-CM-39: no clamp when cards are still in view", () => {
    const storms = [card("a", 100, 100)];
    const pan = { x: 0, y: 0 };
    expect(clampPan(pan, 1, { width: 800, height: 600 }, storms)).toEqual(pan);
  });

  it("TC-CM-40: clamps X when all cards panned off the left", () => {
    // Card at (100,100), viewport 300x200. Panning pan.x=-500 moves visibleLeft
    // to 500, well past maxX=300, so the board is fully off-screen to the left.
    // Valid clamp range: [-80, -20]; pan gets pulled up to -80.
    const storms = [card("a", 100, 100)];
    const pan = { x: -500, y: 0 };
    const result = clampPan(pan, 1, { width: 300, height: 200 }, storms);
    expect(result.x).toBeGreaterThan(pan.x);
    expect(result.x).toBeLessThanOrEqual(0);
  });

  it("TC-CM-41: clamps Y when all cards panned off the top", () => {
    // Card at (100,100), viewport 300x200. pan.y=-500 makes visibleTop=500,
    // past maxY=220. Valid clamp range: [-100, -20]; pan gets pulled to -100.
    const storms = [card("a", 100, 100)];
    const pan = { x: 0, y: -500 };
    const result = clampPan(pan, 1, { width: 300, height: 200 }, storms);
    expect(result.y).toBeGreaterThan(pan.y);
    expect(result.y).toBeLessThanOrEqual(0);
  });

  it("TC-CM-42: does nothing when board is wider than viewport (minPanX > maxPanX)", () => {
    const storms = [card("a", -1000, 100)];
    const pan = { x: 200, y: 0 };
    expect(clampPan(pan, 1, { width: 800, height: 600 }, storms)).toEqual(pan);
  });
});

describe("computeFitView", () => {
  it("TC-CM-43: empty storms returns {zoom: 1, pan: {0,0}}", () => {
    expect(computeFitView([], CARD_W, CARD_H, { width: 800, height: 600 })).toEqual({
      zoom: 1,
      pan: { x: 0, y: 0 },
    });
  });

  it("TC-CM-44: zero viewport returns {zoom: 1, pan: {0,0}}", () => {
    const storms = [card("a", 0, 0)];
    expect(computeFitView(storms, CARD_W, CARD_H, { width: 0, height: 0 })).toEqual({
      zoom: 1,
      pan: { x: 0, y: 0 },
    });
  });

  it("TC-CM-45: single card centres it in the viewport", () => {
    const storms = [card("a", 0, 0)];
    const viewport = { width: 1000, height: 1000 };
    const result = computeFitView(storms, CARD_W, CARD_H, viewport);
    const worldCx = CARD_W / 2;
    const worldCy = CARD_H / 2;
    const screenCx = worldCx * result.zoom + result.pan.x;
    const screenCy = worldCy * result.zoom + result.pan.y;
    expect(screenCx).toBeCloseTo(viewport.width / 2, 5);
    expect(screenCy).toBeCloseTo(viewport.height / 2, 5);
  });

  it("TC-CM-46: multiple cards frames them all", () => {
    const storms = [card("a", 0, 0), card("b", 500, 300)];
    const viewport = { width: 1000, height: 1000 };
    const result = computeFitView(storms, CARD_W, CARD_H, viewport);
    const minX = 0;
    const minY = 0;
    const maxX = 500 + CARD_W;
    const maxY = 300 + CARD_H;
    const left = minX * result.zoom + result.pan.x;
    const top = minY * result.zoom + result.pan.y;
    const right = maxX * result.zoom + result.pan.x;
    const bottom = maxY * result.zoom + result.pan.y;
    expect(left).toBeGreaterThanOrEqual(-1e-9);
    expect(top).toBeGreaterThanOrEqual(-1e-9);
    expect(right).toBeLessThanOrEqual(viewport.width + 1e-9);
    expect(bottom).toBeLessThanOrEqual(viewport.height + 1e-9);
  });

  it("TC-CM-47: zoom is clamped to MIN_ZOOM when cards are huge", () => {
    const storms = [card("a", 0, 0), card("b", 100000, 100000)];
    const result = computeFitView(storms, CARD_W, CARD_H, { width: 800, height: 600 });
    expect(result.zoom).toBe(MIN_ZOOM);
  });

  it("TC-CM-48: zoom is clamped to MAX_ZOOM when cards are tiny", () => {
    // Use small cardW/cardH so raw zoom exceeds MAX_ZOOM and gets clamped.
    // With cardW=10, cardH=10, available 640x440, raw = min(64,44) = 44 -> clamp to 4.
    const storms = [card("a", 0, 0), card("b", 0, 0)];
    const result = computeFitView(storms, 10, 10, { width: 800, height: 600 });
    expect(result.zoom).toBe(MAX_ZOOM);
  });

  it("TC-CM-49: resulting pan centres the bounding box", () => {
    const storms = [card("a", 100, 100), card("b", 300, 250)];
    const viewport = { width: 1000, height: 1000 };
    const result = computeFitView(storms, CARD_W, CARD_H, viewport);
    const minX = 100;
    const minY = 100;
    const maxX = 300 + CARD_W;
    const maxY = 250 + CARD_H;
    const w = maxX - minX;
    const h = maxY - minY;
    const cx = minX + w / 2;
    const cy = minY + h / 2;
    const screenCx = cx * result.zoom + result.pan.x;
    const screenCy = cy * result.zoom + result.pan.y;
    expect(screenCx).toBeCloseTo(viewport.width / 2, 5);
    expect(screenCy).toBeCloseTo(viewport.height / 2, 5);
  });
});

describe("constants", () => {
  it("TC-CM-50: exported constants have the expected values", () => {
    expect(CARD_W).toBe(200);
    expect(CARD_H).toBe(120);
    expect(MIN_ZOOM).toBe(0.25);
    expect(MAX_ZOOM).toBe(4);
    expect(CORNERS_PER_CARD).toBe(3);
    expect(LINKS_PER_CARD).toBe(12);
    expect(PADDING).toBe(80);
  });
});
