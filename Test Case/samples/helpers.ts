import { APIRequestContext, expect } from "@playwright/test";

export const SEED_USERS = {
  admin: { email: "admin@opsdesk.local", password: "password" },
  manager: { email: "manager@opsdesk.local", password: "password" },
  agent: { email: "agent@opsdesk.local", password: "password" },
  hragent: { email: "hragent@opsdesk.local", password: "password" },
  sam: { email: "sam@opsdesk.local", password: "password" },
} as const;

export type Role = keyof typeof SEED_USERS;

/** Fetch the per-session CSRF token (also works before login). */
export async function csrf(request: APIRequestContext): Promise<string> {
  const res = await request.get("/api/auth/csrf");
  expect(res.status()).toBe(200);
  return (await res.json()).csrf_token as string;
}

/**
 * Log in a role on the given request context (cookies are kept by the
 * context). Returns the public user object.
 */
export async function login(
  request: APIRequestContext,
  role: Role,
): Promise<Record<string, unknown>> {
  const token = await csrf(request);
  const res = await request.post("/api/auth/login", {
    headers: { "X-CSRF-Token": token },
    data: SEED_USERS[role],
  });
  expect(res.status(), `login failed for ${role}`).toBe(200);
  return (await res.json()).user as Record<string, unknown>;
}

/** Auth header helper for one-off calls. */
export function withCsrf(token: string): Record<string, string> {
  return { "X-CSRF-Token": token };
}

/** Create an issue as the given (staff) role; returns the issue row. */
export async function createIssue(
  request: APIRequestContext,
  role: Role,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, any>> {
  const token = await csrf(request);
  const res = await request.post("/api/jira/issues", {
    headers: withCsrf(token),
    data: {
      summary: "Playwright seed issue",
      description: "Created by the automated suite.",
      category_id: 1, // Access & Accounts -> IT
      priority: "normal",
      ...overrides,
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).issue as Record<string, any>;
}

/** Move an issue to a status via the staff status endpoint. */
export async function setStatus(
  request: APIRequestContext,
  issueId: number,
  toStatus: string,
  note?: string,
): Promise<import("@playwright/test").APIResponse> {
  const token = await csrf(request);
  return request.post(`/api/jira/issues/${issueId}/status`, {
    headers: withCsrf(token),
    data: { to_status: toStatus, ...(note ? { note } : {}) },
  });
}