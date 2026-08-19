/**
 * Admin role — sample automated tests.
 * Mirrors TC-ADM-01/02/03/11/18 from 01_Role_Admin.md.
 */
import { test, expect } from "@playwright/test";
import { login, csrf, withCsrf, SEED_USERS } from "./helpers";

test.describe("admin", () => {
  test("TC-ADM-01 login returns admin role", async ({ request }) => {
    const me = await login(request, "admin");
    expect(me).toMatchObject({ email: SEED_USERS.admin.email, role: "admin" });
  });

  test("TC-ADM-02 sees HR-team issues (no team scoping)", async ({ request }) => {
    await login(request, "admin");
    const token = await csrf(request);
    // hragent creates an HR-category issue
    const res = await request.post("/api/jira/issues", {
      headers: withCsrf(token),
      data: {
        summary: "HR access request",
        category_id: 4, // HR Request -> HR team
        priority: "normal",
      },
    });
    expect(res.status()).toBe(201);

    const list = await request.get("/api/jira/issues?team_id=2");
    expect(list.status()).toBe(200);
    const body = await list.json();
    expect(body.issues.some((i: any) => i.summary === "HR access request")).toBe(true);
  });

  test("TC-ADM-03 create team + duplicate rejected", async ({ request }) => {
    await login(request, "admin");
    const token = await csrf(request);
    const created = await request.post("/api/admin/teams", {
      headers: withCsrf(token),
      data: { name: "QA" },
    });
    expect(created.status()).toBe(201);

    const dup = await request.post("/api/admin/teams", {
      headers: withCsrf(token),
      data: { name: "QA" },
    });
    expect(dup.status()).toBe(400);
  });

  test("TC-ADM-11 deleting a user with references returns 409", async ({ request }) => {
    await login(request, "admin");
    const token = await csrf(request);
    const users = await (await request.get("/api/admin/users")).json();
    const sam = users.users.find((u: any) => u.email === SEED_USERS.sam.email);
    expect(sam).toBeTruthy();

    // sam must own at least one issue
    const created = await request.post("/api/jira/issues", {
      headers: withCsrf(token),
      data: { summary: "sam's own issue", category_id: 1, priority: "normal" },
    });
    expect(created.status()).toBe(201);

    const del = await request.delete(`/api/admin/users/${sam.id}`, {
      headers: withCsrf(token),
    });
    expect(del.status()).toBe(409);
  });

  test("TC-ADM-18 project duplicate key rejected with 409", async ({ request }) => {
    await login(request, "admin");
    const token = await csrf(request);
    const first = await request.post("/api/jira/projects", {
      headers: withCsrf(token),
      data: { key: "ENG", name: "Engineering" },
    });
    expect(first.status()).toBe(201);
    const dup = await request.post("/api/jira/projects", {
      headers: withCsrf(token),
      data: { key: "ENG", name: "Engineering" },
    });
    expect(dup.status()).toBe(409);
  });

  test("manager cannot reach admin endpoints (cross-role, 403)", async ({ request }) => {
    await login(request, "manager");
    const res = await request.get("/api/admin/teams");
    expect(res.status()).toBe(403);
  });
});