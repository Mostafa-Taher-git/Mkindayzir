/**
 * HR agent role — sample automated tests.
 * Mirrors TC-HR-02/03/04/07/16 from 04_Role_HR_Agent.md.
 */
import { test, expect } from "@playwright/test";
import { login, csrf, withCsrf, createIssue } from "./helpers";

test.describe("hr agent", () => {
  test("TC-HR-02 queue scoped to HR team + unassigned", async ({ request }) => {
    await login(request, "hragent");
    // IT agent creates an IT issue first
    await login(request, "agent");
    await createIssue(request, "agent", { summary: "IT-only issue", category_id: 1 });

    await login(request, "hragent");
    const list = await request.get("/api/jira/issues");
    const body = await list.json();
    expect(body.issues.some((i: any) => i.summary === "IT-only issue")).toBe(false);
  });

  test("TC-HR-03 IT issue returns 404 for HR agent", async ({ request }) => {
    await login(request, "agent");
    const itIssue = await createIssue(request, "agent", { summary: "IT secret", category_id: 1 });

    await login(request, "hragent");
    const res = await request.get(`/api/jira/issues/${itIssue.id}`);
    expect(res.status()).toBe(404);
  });

  test("TC-HR-04 HR category routes requester ticket to HR team", async ({ request }) => {
    await login(request, "sam");
    const token = await csrf(request);
    const created = await request.post("/api/jira/issues", {
      headers: withCsrf(token),
      data: { summary: "Leave request", category_id: 4, priority: "normal" },
    });
    expect(created.status()).toBe(201);
    const issue = (await created.json()).issue;
    // category 4 = HR Request -> default team HR (id 2)
    expect(issue.team_id).toBe(2);

    await login(request, "hragent");
    const list = await (await request.get("/api/jira/issues")).json();
    expect(list.issues.some((i: any) => i.summary === "Leave request")).toBe(true);
  });

  test("TC-HR-07 HR-normal SLA policy applies (4h response)", async ({ request }) => {
    await login(request, "hragent");
    const token = await csrf(request);
    const created = await request.post("/api/jira/issues", {
      headers: withCsrf(token),
      data: { summary: "HR SLA check", category_id: 4, priority: "normal" },
    });
    const issue = (await created.json()).issue;

    const sla = await (await request.get(`/api/jira/issues/${issue.id}/sla`)).json();
    // policy "HR - normal" has response_hours=4
    expect(sla.policy.response_hours).toBe(4);
  });

  test("TC-HR-16 bulk action skips invisible IT tickets", async ({ request }) => {
    await login(request, "agent");
    const itIssue = await createIssue(request, "agent", { summary: "IT bulk target", category_id: 1 });

    await login(request, "hragent");
    const token = await csrf(request);
    const hrIssue = await createIssue(request, "hragent", { summary: "HR bulk target", category_id: 4 });

    const res = await request.post("/api/jira/issues/bulk", {
      headers: withCsrf(token),
      data: { issue_ids: [hrIssue.id, itIssue.id], action: "status", to_status: "assigned" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.skipped.some((s: any) => s.id === itIssue.id)).toBe(true);
  });

  test("TC-HR-13 reports/admin/analytics all 403", async ({ request }) => {
    await login(request, "hragent");
    expect((await request.get("/api/reports/summary")).status()).toBe(403);
    expect((await request.get("/api/admin/teams")).status()).toBe(403);
    expect((await request.get("/api/kb/analytics")).status()).toBe(403);
  });
});