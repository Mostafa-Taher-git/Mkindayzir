# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hragent.spec.ts >> hr agent >> TC-HR-04 HR category routes requester ticket to HR team
- Location: Test Case/samples/hragent.spec.ts:30:7

# Error details

```
Error: login failed for sam

expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 429
```

# Test source

```ts
  1  | import { APIRequestContext, expect } from "@playwright/test";
  2  | 
  3  | export const SEED_USERS = {
  4  |   admin: { email: "admin@opsdesk.local", password: "password" },
  5  |   manager: { email: "manager@opsdesk.local", password: "password" },
  6  |   agent: { email: "agent@opsdesk.local", password: "password" },
  7  |   hragent: { email: "hragent@opsdesk.local", password: "password" },
  8  |   sam: { email: "sam@opsdesk.local", password: "password" },
  9  | } as const;
  10 | 
  11 | export type Role = keyof typeof SEED_USERS;
  12 | 
  13 | /** Fetch the per-session CSRF token (also works before login). */
  14 | export async function csrf(request: APIRequestContext): Promise<string> {
  15 |   const res = await request.get("/api/auth/csrf");
  16 |   expect(res.status()).toBe(200);
  17 |   return (await res.json()).csrf_token as string;
  18 | }
  19 | 
  20 | /**
  21 |  * Log in a role on the given request context (cookies are kept by the
  22 |  * context). Returns the public user object.
  23 |  */
  24 | export async function login(
  25 |   request: APIRequestContext,
  26 |   role: Role,
  27 | ): Promise<Record<string, unknown>> {
  28 |   const token = await csrf(request);
  29 |   const res = await request.post("/api/auth/login", {
  30 |     headers: { "X-CSRF-Token": token },
  31 |     data: SEED_USERS[role],
  32 |   });
> 33 |   expect(res.status(), `login failed for ${role}`).toBe(200);
     |                                                    ^ Error: login failed for sam
  34 |   return (await res.json()).user as Record<string, unknown>;
  35 | }
  36 | 
  37 | /** Auth header helper for one-off calls. */
  38 | export function withCsrf(token: string): Record<string, string> {
  39 |   return { "X-CSRF-Token": token };
  40 | }
  41 | 
  42 | /** Create an issue as the given (staff) role; returns the issue row. */
  43 | export async function createIssue(
  44 |   request: APIRequestContext,
  45 |   role: Role,
  46 |   overrides: Record<string, unknown> = {},
  47 | ): Promise<Record<string, any>> {
  48 |   const token = await csrf(request);
  49 |   const res = await request.post("/api/jira/issues", {
  50 |     headers: withCsrf(token),
  51 |     data: {
  52 |       summary: "Playwright seed issue",
  53 |       description: "Created by the automated suite.",
  54 |       category_id: 1, // Access & Accounts -> IT
  55 |       priority: "normal",
  56 |       ...overrides,
  57 |     },
  58 |   });
  59 |   expect(res.status()).toBe(201);
  60 |   return (await res.json()).issue as Record<string, any>;
  61 | }
  62 | 
  63 | /** Move an issue to a status via the staff status endpoint. */
  64 | export async function setStatus(
  65 |   request: APIRequestContext,
  66 |   issueId: number,
  67 |   toStatus: string,
  68 |   note?: string,
  69 | ): Promise<import("@playwright/test").APIResponse> {
  70 |   const token = await csrf(request);
  71 |   return request.post(`/api/jira/issues/${issueId}/status`, {
  72 |     headers: withCsrf(token),
  73 |     data: { to_status: toStatus, ...(note ? { note } : {}) },
  74 |   });
  75 | }
```