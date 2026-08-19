# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hragent.spec.ts >> hr agent >> TC-HR-07 HR-normal SLA policy applies (4h response)
- Location: Test Case/samples/hragent.spec.ts:47:7

# Error details

```
TypeError: Cannot read properties of undefined (reading 'response_hours')
```

# Test source

```ts
  1  | /**
  2  |  * HR agent role — sample automated tests.
  3  |  * Mirrors TC-HR-02/03/04/07/16 from 04_Role_HR_Agent.md.
  4  |  */
  5  | import { test, expect } from "@playwright/test";
  6  | import { login, csrf, withCsrf, createIssue } from "./helpers";
  7  | 
  8  | test.describe("hr agent", () => {
  9  |   test("TC-HR-02 queue scoped to HR team + unassigned", async ({ request }) => {
  10 |     await login(request, "hragent");
  11 |     // IT agent creates an IT issue first
  12 |     await login(request, "agent");
  13 |     await createIssue(request, "agent", { summary: "IT-only issue", category_id: 1 });
  14 | 
  15 |     await login(request, "hragent");
  16 |     const list = await request.get("/api/jira/issues");
  17 |     const body = await list.json();
  18 |     expect(body.issues.some((i: any) => i.summary === "IT-only issue")).toBe(false);
  19 |   });
  20 | 
  21 |   test("TC-HR-03 IT issue returns 404 for HR agent", async ({ request }) => {
  22 |     await login(request, "agent");
  23 |     const itIssue = await createIssue(request, "agent", { summary: "IT secret", category_id: 1 });
  24 | 
  25 |     await login(request, "hragent");
  26 |     const res = await request.get(`/api/jira/issues/${itIssue.id}`);
  27 |     expect(res.status()).toBe(404);
  28 |   });
  29 | 
  30 |   test("TC-HR-04 HR category routes requester ticket to HR team", async ({ request }) => {
  31 |     await login(request, "sam");
  32 |     const token = await csrf(request);
  33 |     const created = await request.post("/api/jira/issues", {
  34 |       headers: withCsrf(token),
  35 |       data: { summary: "Leave request", category_id: 4, priority: "normal" },
  36 |     });
  37 |     expect(created.status()).toBe(201);
  38 |     const issue = (await created.json()).issue;
  39 |     // category 4 = HR Request -> default team HR (id 2)
  40 |     expect(issue.team_id).toBe(2);
  41 | 
  42 |     await login(request, "hragent");
  43 |     const list = await (await request.get("/api/jira/issues")).json();
  44 |     expect(list.issues.some((i: any) => i.summary === "Leave request")).toBe(true);
  45 |   });
  46 | 
  47 |   test("TC-HR-07 HR-normal SLA policy applies (4h response)", async ({ request }) => {
  48 |     await login(request, "hragent");
  49 |     const token = await csrf(request);
  50 |     const created = await request.post("/api/jira/issues", {
  51 |       headers: withCsrf(token),
  52 |       data: { summary: "HR SLA check", category_id: 4, priority: "normal" },
  53 |     });
  54 |     const issue = (await created.json()).issue;
  55 | 
  56 |     const sla = await (await request.get(`/api/jira/issues/${issue.id}/sla`)).json();
  57 |     // policy "HR - normal" has response_hours=4
> 58 |     expect(sla.policy.response_hours).toBe(4);
     |                       ^ TypeError: Cannot read properties of undefined (reading 'response_hours')
  59 |   });
  60 | 
  61 |   test("TC-HR-16 bulk action skips invisible IT tickets", async ({ request }) => {
  62 |     await login(request, "agent");
  63 |     const itIssue = await createIssue(request, "agent", { summary: "IT bulk target", category_id: 1 });
  64 | 
  65 |     await login(request, "hragent");
  66 |     const token = await csrf(request);
  67 |     const hrIssue = await createIssue(request, "hragent", { summary: "HR bulk target", category_id: 4 });
  68 | 
  69 |     const res = await request.post("/api/jira/issues/bulk", {
  70 |       headers: withCsrf(token),
  71 |       data: { issue_ids: [hrIssue.id, itIssue.id], action: "status", to_status: "assigned" },
  72 |     });
  73 |     expect(res.status()).toBe(200);
  74 |     const body = await res.json();
  75 |     expect(body.skipped.some((s: any) => s.id === itIssue.id)).toBe(true);
  76 |   });
  77 | 
  78 |   test("TC-HR-13 reports/admin/analytics all 403", async ({ request }) => {
  79 |     await login(request, "hragent");
  80 |     expect((await request.get("/api/reports/summary")).status()).toBe(403);
  81 |     expect((await request.get("/api/admin/teams")).status()).toBe(403);
  82 |     expect((await request.get("/api/kb/analytics")).status()).toBe(403);
  83 |   });
  84 | });
```