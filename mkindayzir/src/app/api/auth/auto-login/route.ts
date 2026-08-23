import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getConfig, isPersonalMode } from "@/lib/config";
import { createSession } from "@/lib/auth";

export async function GET(request: Request) {
  const config = getConfig();

  // Auto-login is only valid for single-user Personal mode.
  if (!isPersonalMode() || !config.autoLogin) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", status: "ACTIVE" },
    select: { id: true },
  });

  if (!admin) {
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  await createSession(admin.id);

  const callbackUrl = new URL(request.url).searchParams.get("callbackUrl") || "/dashboard";
  return NextResponse.redirect(new URL(callbackUrl, request.url));
}
