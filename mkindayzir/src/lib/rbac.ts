import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export const ROLES = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  MEMBER: "MEMBER",
  VIEWER: "VIEWER",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const PERMISSIONS = {
  MANAGE_USERS: "manage:users",
  MANAGE_TEAMS: "manage:teams",
  MANAGE_PROJECTS: "manage:projects",
  MANAGE_WORK_ITEMS: "manage:work_items",
  MANAGE_BOARDS: "manage:boards",
  MANAGE_VAULT: "manage:vault",
  MANAGE_SETTINGS: "manage:settings",
  VIEW_DASHBOARD: "view:dashboard",
  VIEW_PROJECTS: "view:projects",
  VIEW_BOARDS: "view:boards",
  VIEW_VAULT: "view:vault",
  VIEW_REPORTS: "view:reports",
  CREATE_WORK_ITEMS: "create:work_items",
  EDIT_WORK_ITEMS: "edit:work_items",
  DELETE_WORK_ITEMS: "delete:work_items",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const rolePermissions: Record<Role, Permission[]> = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  [ROLES.MANAGER]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.VIEW_BOARDS,
    PERMISSIONS.VIEW_VAULT,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_PROJECTS,
    PERMISSIONS.MANAGE_TEAMS,
    PERMISSIONS.MANAGE_WORK_ITEMS,
    PERMISSIONS.MANAGE_BOARDS,
    PERMISSIONS.CREATE_WORK_ITEMS,
    PERMISSIONS.EDIT_WORK_ITEMS,
    PERMISSIONS.DELETE_WORK_ITEMS,
  ],
  [ROLES.MEMBER]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.VIEW_BOARDS,
    PERMISSIONS.VIEW_VAULT,
    PERMISSIONS.CREATE_WORK_ITEMS,
    PERMISSIONS.EDIT_WORK_ITEMS,
  ],
  [ROLES.VIEWER]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.VIEW_BOARDS,
    PERMISSIONS.VIEW_VAULT,
    PERMISSIONS.VIEW_REPORTS,
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}

export async function requirePermission(permission: Permission) {
  const session = await auth();

  if (!session?.user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      authorized: false,
    };
  }

  const role = session.user.role as Role;

  if (!hasPermission(role, permission)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      authorized: false,
    };
  }

  return { error: null, session, authorized: true };
}
