import 'server-only';

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { hasPermission, PERMISSIONS, ROLES } from "./rbac";
import type { Role, Permission } from "./rbac";

export { PERMISSIONS, ROLES };
export type { Role, Permission };

export async function requirePermission(permission: Permission) {
  const session = await getSession();

  if (!session) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      authorized: false,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true },
  });

  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      authorized: false,
    };
  }

  const role = user.role as Role;

  if (!hasPermission(role, permission)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      authorized: false,
    };
  }

  return { error: null, session: { ...session, user }, authorized: true };
}
