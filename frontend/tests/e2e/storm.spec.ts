import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Storm page e2e: create → link → rename → delete.
 *
 * Hermetic: all /api/storms* calls are intercepted at the browser level via
 * page.route(). The test does not need a real backend. The Vite dev server
 * only needs to serve the React shell.
 */

type Storm = {
  id: string;
  name: string;
  positionX: number;
  positionY: number;
  isArchived: boolean;
};

type Link = {
  id: string;
  sourceId: string;
  targetId: string;
  sourceCorner: number;
  targetCorner: number;
};

type DB = { storms: Storm[]; links: Link[] };

function emptyDb(): DB {
  return { storms: [], links: [] };
}

function nextId(db: DB, prefix: string): string {
  const n = prefix === "s" ? db.storms.length + 1 : db.links.length + 1;
  return `${prefix}${n}`;
}

async function stubStormsApi(page: Page, db: () => DB) {
  const handler = async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (method === "GET" && path === "/api/storms") {
      return json(200, db());
    }

    if (method === "POST" && path === "/api/storms") {
      const { name } = JSON.parse(req.postData() ?? "{}") as { name?: string };
      const id = nextId(db(), "s");
      const storm: Storm = {
        id,
        name: name ?? "",
        positionX: 100 + db().storms.length * 220,
        positionY: 100,
        isArchived: false,
      };
      db().storms.push(storm);
      return json(200, { storm });
    }

    const stormItem = path.match(/^\/api\/storms\/([^/]+)$/);
    if (stormItem && method === "PATCH") {
      const id = stormItem[1];
      const patch = JSON.parse(req.postData() ?? "{}") as Partial<Storm>;
      const s = db().storms.find((x) => x.id === id);
      if (s) Object.assign(s, patch);
      return json(200, { storm: s });
    }
    if (stormItem && method === "DELETE") {
      const id = stormItem[1];
      db().storms = db().storms.filter((s) => s.id !== id);
      db().links = db().links.filter((l) => l.sourceId !== id && l.targetId !== id);
      return route.fulfill({ status: 204, body: "" });
    }

    const linkCreate = path.match(/^\/api\/storms\/([^/]+)\/links$/);
    if (linkCreate && method === "POST") {
      const sourceId = linkCreate[1];
      const { targetId, sourceCorner, targetCorner } = JSON.parse(
        req.postData() ?? "{}",
      ) as { targetId: string; sourceCorner: number; targetCorner: number };
      const id = nextId(db(), "l");
      const link: Link = { id, sourceId, targetId, sourceCorner, targetCorner };
      db().links.push(link);
      return json(200, { link });
    }
    const linkDelete = path.match(/^\/api\/storms\/([^/]+)\/links\/([^/]+)$/);
    if (linkDelete && method === "DELETE") {
      const linkId = linkDelete[2];
      db().links = db().links.filter((l) => l.id !== linkId);
      return route.fulfill({ status: 204, body: "" });
    }

    const move = path.match(/^\/api\/storms\/([^/]+)\/move-subtree$/);
    if (move && method === "POST") {
      const { dx, dy } = JSON.parse(req.postData() ?? "{}") as { dx: number; dy: number };
      const id = move[1];
      const visited = new Set<string>();
      const queue = [id];
      while (queue.length) {
        const cur = queue.shift()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        const s = db().storms.find((x) => x.id === cur);
        if (s) {
          s.positionX += dx;
          s.positionY += dy;
        }
        for (const l of db().links) {
          if (l.sourceId === cur) queue.push(l.targetId);
          if (l.targetId === cur) queue.push(l.sourceId);
        }
      }
      return json(200, { ok: true });
    }

    return json(200, {});
  };

  await page.route("**/api/storms**", handler);
}

test.describe("Storm page", () => {
  test("create → link → rename → delete", async ({ page }) => {
    test.setTimeout(60_000);

    const db = emptyDb();
    await stubStormsApi(page, () => db);
    page.on("dialog", (d) => d.accept());

    // 1. Empty state
    await page.goto("/storm");
    await expect(page.getByTestId("canvas")).toBeVisible();
    await expect(page.getByTestId("fit-view-button")).toBeVisible();
    await expect(page.getByTestId("new-storm-button")).toBeVisible();
    await expect(page.getByTestId("card")).toHaveCount(0);

    // 2. Create Idea A via + New button
    await page.getByTestId("new-storm-button").click();
    await expect(page.getByTestId("new-storm-modal")).toBeVisible();
    await page.getByTestId("new-storm-input").fill("Idea A");
    await page.getByTestId("create-storm-button").click();

    await page.waitForURL(/\/storm\/s1\/note$/);
    expect(db.storms).toHaveLength(1);
    expect(db.storms[0].name).toBe("Idea A");

    // 3. Back to canvas, rename
    await page.goto("/storm");
    await expect(page.getByTestId("card")).toHaveCount(1);
    await expect(page.getByTestId("card-name")).toHaveText("Idea A");

    await page.getByRole("button", { name: "Rename" }).first().click();
    const renameInput = page.getByTestId("rename-input");
    await expect(renameInput).toBeVisible();
    await renameInput.fill("Idea A+");
    await renameInput.press("Enter");
    await expect(page.getByTestId("card-name")).toHaveText("Idea A+");
    expect(db.storms[0].name).toBe("Idea A+");

    // 4. Create Idea B
    await page.getByTestId("new-storm-button").click();
    await page.getByTestId("new-storm-input").fill("Idea B");
    await page.getByTestId("create-storm-button").click();
    await page.waitForURL(/\/storm\/s2\/note$/);

    await page.goto("/storm");
    await expect(page.getByTestId("card")).toHaveCount(2);

    // 5. Link card A → card B by dragging from a corner of card A onto card B
    const cards = page.getByTestId("card");
    const cardA = cards.nth(0);
    const cardB = cards.nth(1);

    const aBox = await cardA.boundingBox();
    const bBox = await cardB.boundingBox();
    if (!aBox || !bBox) throw new Error("card boxes missing");

    const cornerBox = await cardA.getByTestId("corner").first().boundingBox();
    if (!cornerBox) throw new Error("corner not laid out");

    const startX = cornerBox.x + cornerBox.width / 2;
    const startY = cornerBox.y + cornerBox.height / 2;
    const endX = bBox.x + bBox.width / 2;
    const endY = bBox.y + bBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move((startX + endX) / 2, (startY + endY) / 2, { steps: 10 });
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();

    await expect(page.getByTestId("link-line")).toHaveCount(1);
    expect(db.links).toHaveLength(1);
    const linkId = db.links[0].id;

    // 6. Click the link line → delete handle (the small × in the middle) → confirm
    await page.getByTestId("link-line").first().click({ force: true });
    const linkGroup = page.getByTestId("link-line").first();
    const lg = await linkGroup.boundingBox();
    if (!lg) throw new Error("link group not laid out");
    await page.mouse.click(lg.x + lg.width / 2, lg.y + lg.height / 2);
    await expect(page.getByTestId("link-line")).toHaveCount(0);
    expect(db.links.find((l) => l.id === linkId)).toBeUndefined();

    // 7. Delete Idea A
    const beforeCount = db.storms.length;
    await page.getByTestId("delete-card-button").first().click();
    await expect(page.getByTestId("card")).toHaveCount(beforeCount - 1);
    expect(db.storms).toHaveLength(1);
  });
});
