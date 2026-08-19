/**
 * Requester role — sample automated tests.
 * Mirrors TC-REQ-01/03/07/13/17/21/23 from 05_Role_Requester.md.
 */
import { test, expect } from "@playwright/test";
import { login, csrf, withCsrf, createIssue, setStatus, SEED_USERS } from "./helpers";

test.describe("requester", () => {
  test("TC-REQ-01 login lands as requester role", async ({ request }) => {
    const me = await login(request, "sam");
    expect(me).toMatchObject({ email: SEED_USERS.sam.email, role: "requester" });
  });

  test("TC-REQ-03 create request routes via category default team", async ({ request }) => {
    await login(request, "sam");
    const token = await csrf(request);
    const res = await request.post("/api/jira/issues", {
      headers: withCsrf(token),
      data: {
        summary: "VPN access for contractor",
        description: "Needs access to the VPN",
        category_id: 1, // Access & Accounts -> IT
        priority: "high",
      },
    });
    expect(res.status()).toBe(201);
    const issue = (await res.json()).issue;
    expect(issue.status).toBe("new");
    expect(issue.team_id).toBe(1); // IT
    expect(issue.issue_key).toMatch(/^OPS-\d+$/);
  });

  test("TC-REQ-07 my requests only shows own tickets", async ({ request }) => {
    await login(request, "agent");
    await createIssue(request, "agent", { summary: "not sam's issue" });

    await login(request, "sam");
    const token = await csrf(request);
    await request.post("/api/jira/issues", {
      headers: withCsrf(token),
      data: { summary: "sam's own issue", category_id: 1, priority: "normal" },
    });

    const list = await (await request.get("/api/jira/issues")).json();
    expect(list.issues.some((i: any) => i.summary === "not sam's issue")).toBe(false);
    expect(list.issues.some((i: any) => i.summary === "sam's own issue")).toBe(true);
  });

  test("TC-REQ-13 internal comment is forbidden for requester (403)", async ({ request }) => {
    await login(request, "sam");
    const token = await csrf(request);
    const created = await request.post("/api/jira/issues", {
      headers: withCsrf(token),
      data: { summary: "internal attempt", category_id: 1, priority: "normal" },
    });
    const issue = (await created.json()).issue;

    const res = await request.post(`/api/jira/issues/${issue.id}/comments`, {
      headers: withCsrf(token),
      data: { body: "secret", visibility: "internal" },
    });
    expect(res.status()).toBe(403);
  });

  test("TC-REQ-17 requester cannot assign or transition status", async ({ request }) => {
    await login(request, "sam");
    const token = await csrf(request);
    const created = await request.post("/api/jira/issues", {
      headers: withCsrf(token),
      data: { summary: "no staff powers", category_id: 1, priority: "normal" },
    });
    const issue = (await created.json()).issue;

    const assign = await request.post(`/api/jira/issues/${issue.id}/assign`, {
      headers: withCsrf(token),
      data: { self: true },
    });
    expect(assign.status()).toBe(403);

    const status = await request.post(`/api/jira/issues/${issue.id}/status`, {
      headers: withCsrf(token),
      data: { to_status: "in_progress" },
    });
    expect([400, 403]).toContain(status.status());
  });

  test("TC-REQ-21 CSAT: rate own resolved ticket once; duplicate rejected", async ({ request }) => {
    // sam creates the issue (must own it for CSAT), agent resolves it
    await login(request, "sam");
    const token = await csrf(request);
    const created = await request.post("/api/jira/issues", {
      headers: withCsrf(token),
      data: { summary: "csat target", category_id: 1, priority: "normal" },
    });
    const issue = (await created.json()).issue;

    await login(request, "agent");
    await setStatus(request, issue.id, "assigned");
    await setStatus(request, issue.id, "in_progress");
    await setStatus(request, issue.id, "resolved");

    await login(request, "sam");
    const rate = await request.post(`/api/jira/issues/${issue.id}/rate`, {
      headers: withCsrf(token),
      data: { score: 4 },
    });
    expect(rate.status()).toBe(200);

    const again = await request.post(`/api/jira/issues/${issue.id}/rate`, {
      headers: withCsrf(token),
      data: { score: 5 },
    });
    expect(again.status()).toBe(400);
  });

  test("TC-REQ-23 requester sees published KB notes only; drafts 404; authoring 403", async ({ request }) => {
    await login(request, "agent");
    const token = await csrf(request);
    const draft = await request.post("/api/kb/notes", {
      headers: withCsrf(token),
      data: { title: "Draft Guide", content: "unpublished" },
    });
    expect(draft.status()).toBe(201);
    const draftId = (await draft.json()).note.id;
    const published = await request.post("/api/kb/notes", {
      headers: withCsrf(token),
      data: { title: "Published Guide", content: "public" },
    });
    const pubId = (await published.json()).note.id;
    await request.post(`/api/kb/notes/${pubId}/publish`, { headers: withCsrf(token) });

    await login(request, "sam");
    const list = await (await request.get("/api/kb/notes")).json();
    expect(list.items.some((n: any) => n.id === draftId)).toBe(false);
    expect(list.items.some((n: any) => n.id === pubId)).toBe(true);
    expect((await request.get(`/api/kb/notes/${draftId}`)).status()).toBe(404);

    const create = await request.post("/api/kb/notes", {
      headers: withCsrf(token),
      data: { title: "Nope", content: "x", folder_id: 1 },
    });
    expect(create.status()).toBe(403);
  });

  test("TC-REQ-22 dashboard/reports denied with 403", async ({ request }) => {
    await login(request, "sam");
    expect((await request.get("/api/dashboard")).status()).toBe(403);
    expect((await request.get("/api/reports/summary")).status()).toBe(403);
  });
});