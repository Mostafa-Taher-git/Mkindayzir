/**
 * IT agent role — sample automated tests.
 * Mirrors TC-AGT-02/03/09/11/13/16/26 from 03_Role_IT_Agent.md.
 */
import { test, expect } from "@playwright/test";
import { login, csrf, withCsrf, createIssue, setStatus, SEED_USERS } from "./helpers";

test.describe("it agent", () => {
  test("TC-AGT-02 queue is scoped to IT team + unassigned", async ({ request }) => {
    await login(request, "agent");
    // hragent creates an HR issue; the agent must NOT see it
    const hrCtx = request; // same context trick: login as hragent below
    await login(hrCtx, "hragent");
    const token = await csrf(hrCtx);
    await hrCtx.post("/api/jira/issues", {
      headers: withCsrf(token),
      data: { summary: "HR-only issue", category_id: 4, priority: "normal" },
    });

    await login(request, "agent");
    const list = await request.get("/api/jira/issues");
    const body = await list.json();
    expect(body.issues.some((i: any) => i.summary === "HR-only issue")).toBe(false);
  });

  test("TC-AGT-03 HR ticket detail returns 404 (no data leak)", async ({ request }) => {
    await login(request, "hragent");
    const token = await csrf(request);
    const created = await request.post("/api/jira/issues", {
      headers: withCsrf(token),
      data: { summary: "HR confidential", category_id: 4, priority: "normal" },
    });
    const hrIssue = await created.json();

    await login(request, "agent");
    const res = await request.get(`/api/jira/issues/${hrIssue.id}`);
    expect(res.status()).toBe(404);
  });

  test("TC-AGT-09 claim an unassigned ticket", async ({ request }) => {
    await login(request, "agent");
    const issue = await createIssue(request, "agent");
    const token = await csrf(request);

    const claim = await request.post(`/api/jira/issues/${issue.id}/assign`, {
      headers: withCsrf(token),
      data: { self: true },
    });
    expect(claim.status()).toBe(200);

    const detail = await request.get(`/api/jira/issues/${issue.id}`);
    const body = await detail.json();
    expect(body.status).toBe("assigned");
    expect(body.assignee).toBeTruthy();
  });

  test("TC-AGT-11 happy-path lifecycle to closed", async ({ request }) => {
    await login(request, "agent");
    const issue = await createIssue(request, "agent");
    for (const s of ["assigned", "in_progress", "resolved", "closed"]) {
      const res = await setStatus(request, issue.id, s);
      expect(res.status(), `transition to ${s}`).toBe(200);
    }
    const detail = await request.get(`/api/jira/issues/${issue.id}`);
    const body = await detail.json();
    expect(body.status).toBe("closed");
    expect(body.closed_at).toBeTruthy();
  });

  test("TC-AGT-13 blocked requires reason (400 without, 200 with)", async ({ request }) => {
    await login(request, "agent");
    const issue = await createIssue(request, "agent");
    await setStatus(request, issue.id, "assigned");
    await setStatus(request, issue.id, "in_progress");

    expect((await setStatus(request, issue.id, "blocked")).status()).toBe(400);
    expect((await setStatus(request, issue.id, "blocked", "Blocked by vendor")).status()).toBe(200);
  });

  test("TC-AGT-16 internal comment invisible to requester", async ({ request }) => {
    await login(request, "agent");
    const token = await csrf(request);
    const created = await request.post("/api/jira/issues", {
      headers: withCsrf(token),
      data: { summary: "Internal note test", category_id: 1, priority: "normal" },
    });
    const issue = (await created.json()).issue;

    await request.post(`/api/jira/issues/${issue.id}/comments`, {
      headers: withCsrf(token),
      data: { body: "staff only", visibility: "internal" },
    });

    await login(request, "sam");
    const detail = await (await request.get(`/api/jira/issues/${issue.id}`)).json();
    expect(detail.comments.some((c: any) => c.body === "staff only")).toBe(false);
  });

  test("TC-AGT-26 AI endpoints fail closed without a key (503)", async ({ request }) => {
    await login(request, "agent");
    const issue = await createIssue(request, "agent");
    const res = await request.get(`/api/ai/suggest-reply/${issue.id}`);
    expect(res.status()).toBe(503);
  });

  test("TC-AGT-30 agent cannot rate CSAT (requester only, 403)", async ({ request }) => {
    await login(request, "agent");
    const issue = await createIssue(request, "agent");
    await setStatus(request, issue.id, "assigned");
    await setStatus(request, issue.id, "in_progress");
    await setStatus(request, issue.id, "resolved");
    const token = await csrf(request);
    const res = await request.post(`/api/jira/issues/${issue.id}/rate`, {
      headers: withCsrf(token),
      data: { score: 5 },
    });
    expect(res.status()).toBe(403);
  });

  test("sam's seeded email is the requester", () => {
    expect(SEED_USERS.sam.email).toBe("sam@opsdesk.local");
  });
});