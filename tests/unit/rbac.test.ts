/**
 * TC-RBAC-FE-01  admin has every permission
 * TC-RBAC-FE-02  manager can manage projects/boards/tickets but not users
 * TC-RBAC-FE-03  member can create/edit work items, cannot delete or manage
 * TC-RBAC-FE-04  viewer is read-only (view:* only)
 * TC-RBAC-FE-05  unknown role / unknown permission -> false
 */
import { describe, expect, it } from "vitest";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";

describe("frontend RBAC matrix", () => {
  it("TC-RBAC-FE-01: admin has all permissions", () => {
    for (const p of Object.values(PERMISSIONS)) {
      expect(hasPermission("ADMIN", p)).toBe(true);
    }
  });

  it("TC-RBAC-FE-02: manager manages projects/boards/tickets, not users", () => {
    expect(hasPermission("MANAGER", PERMISSIONS.MANAGE_PROJECTS)).toBe(true);
    expect(hasPermission("MANAGER", PERMISSIONS.MANAGE_BOARDS)).toBe(true);
    expect(hasPermission("MANAGER", PERMISSIONS.MANAGE_TICKETS)).toBe(true);
    expect(hasPermission("MANAGER", PERMISSIONS.MANAGE_USERS)).toBe(false);
  });

  it("TC-RBAC-FE-03: member creates/edits but cannot delete or manage", () => {
    expect(hasPermission("MEMBER", PERMISSIONS.CREATE_WORK_ITEMS)).toBe(true);
    expect(hasPermission("MEMBER", PERMISSIONS.EDIT_WORK_ITEMS)).toBe(true);
    expect(hasPermission("MEMBER", PERMISSIONS.DELETE_WORK_ITEMS)).toBe(false);
    expect(hasPermission("MEMBER", PERMISSIONS.MANAGE_PROJECTS)).toBe(false);
    // tickets: view/create/reply yes, manage no
    expect(hasPermission("MEMBER", PERMISSIONS.VIEW_TICKETS)).toBe(true);
    expect(hasPermission("MEMBER", PERMISSIONS.CREATE_TICKETS)).toBe(true);
    expect(hasPermission("MEMBER", PERMISSIONS.REPLY_TICKETS)).toBe(true);
    expect(hasPermission("MEMBER", PERMISSIONS.MANAGE_TICKETS)).toBe(false);
  });

  it("TC-RBAC-FE-04: viewer is strictly read-only", () => {
    expect(hasPermission("VIEWER", PERMISSIONS.VIEW_PROJECTS)).toBe(true);
    expect(hasPermission("VIEWER", PERMISSIONS.VIEW_TICKETS)).toBe(true);
    expect(hasPermission("VIEWER", PERMISSIONS.CREATE_TICKETS)).toBe(false);
    expect(hasPermission("VIEWER", PERMISSIONS.EDIT_WORK_ITEMS)).toBe(false);
    expect(hasPermission("VIEWER", PERMISSIONS.MANAGE_BOARDS)).toBe(false);
  });

  it("TC-RBAC-FE-05: unknown role or permission -> false", () => {
    expect(hasPermission("SUPERGOD", "view:projects")).toBe(false);
    expect(hasPermission("ADMIN", "fly:at-will")).toBe(false);
  });
});
