/**
 * Manager role — sample automated tests.
 * Mirrors TC-MGR-02/09/12/13/15 from 02_Role_Manager.md.
 */
import { test, expect } from "@playwright/test";
import { login, csrf, withCsrf, createIssue, setStatus } from "./helpers";

test.describe("manager", () => {
  test("TC-MGR-02 sees both IT and HR team issues", async ({ request }) => {
    await login(request, "manager");
    const hr = await request.get("/api/jira/issues?team_id=2");
    const it = await request.get("/api/jira/issues?team_id=1");
    expect(hr.status()).toBe(200);
    expect(it.status()).toBe(200);
  });

  test("TC-MGR-09 agent gets 403 on reports", async ({ request }) => {
    await login(request, "agent");
    const res = await request.get("/api/reports/summary?days=30");
    expect(res.status()).toBe(403);
  });

  test("TC-MGR-12 manager creates and edits an SLA policy", async ({ request }) => {
    await login(request, "manager");
    const token = await csrf(request);
    const created = await request.post("/api/sla-policies", {
      headers: withCsrf(token),
      data: { name: "Dev Urgent", priority: "urgent", response_hours: 1, resolution_hours: 6 },
    });
    expect(created.status()).toBe(201);
    const policy = (await created.json()).policy;

    const patched = await request.patch(`/api/sla-policies/${policy.id}`, {
      headers: withCsrf(token),
      data: { resolution_hours: 4 },
    });
    expect(patched.status()).toBe(200);
  });

  test("TC-MGR-13 manager cannot delete an SLA policy (admin only)", async ({ request }) => {
    await login(request, "manager");
    const token = await csrf(request);
    const created = await request.post("/api/sla-policies", {
      headers: withCsrf(token),
      data: { name: "Temp Policy", priority: "low", response_hours: 24, resolution_hours: 168 },
    });
    const policy = (await created.json()).policy;
    const del = await request.delete(`/api/sla-policies/${policy.id}`, {
      headers: withCsrf(token),
    });
    expect(del.status()).toBe(403);
  });

  test("TC-MGR-15 sprint lifecycle: create -> start -> complete", async ({ request }) => {
    await login(request, "manager");
    const token = await csrf(request);

    const sprint = await request.post("/api/jira/sprints", {
      headers: withCsrf(token),
      data: { project_id: 1, name: "Sprint 1" },
    });
    expect(sprint.status()).toBe(201);
    const sid = (await sprint.json()).sprint.id;

    const started = await request.post(`/api/jira/sprints/${sid}/start`, {
      headers: withCsrf(token),
    });
    expect(started.status()).toBe(200);

    const completed = await request.post(`/api/jira/sprints/${sid}/complete`, {
      headers: withCsrf(token),
    });
    expect(completed.status()).toBe(200);
  });

  test("TC-MGR-24 blocked transition requires a reason", async ({ request }) => {
    await login(request, "manager");
    const issue = await createIssue(request, "manager");
    await setStatus(request, issue.id, "assigned");
    await setStatus(request, issue.id, "in_progress");

    const noReason = await setStatus(request, issue.id, "blocked");
    expect(noReason.status()).toBe(400);

    const withReason = await setStatus(request, issue.id, "blocked", "Waiting on vendor");
    expect(withReason.status()).toBe(200);
  });
});