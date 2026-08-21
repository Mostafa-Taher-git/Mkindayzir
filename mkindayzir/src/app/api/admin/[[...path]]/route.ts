import { NextResponse } from "next/server";
import { getSessionUser, requirePermission } from "@/lib/auth";
import { ROLES, PERMISSIONS } from "@/lib/rbac";

export async function GET(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const session = await getSessionUser();
  if (!session || session.role !== ROLES.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { path } = await params;
  const subpath = path?.join("/") || "";

  // TODO: Route to specific admin handlers based on subpath
  return NextResponse.json({ data: null, path: subpath });
}

export async function POST(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const session = await getSessionUser();
  if (!session || session.role !== ROLES.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { path } = await params;
  const subpath = path?.join("/") || "";

  // TODO: Route to specific admin handlers based on subpath
  return NextResponse.json({ data: null, path: subpath }, { status: 201 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const session = await getSessionUser();
  if (!session || session.role !== ROLES.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { path } = await params;
  const subpath = path?.join("/") || "";

  // TODO: Route to specific admin handlers based on subpath
  return NextResponse.json({ data: null, path: subpath });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const session = await getSessionUser();
  if (!session || session.role !== ROLES.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { path } = await params;
  const subpath = path?.join("/") || "";

  // TODO: Route to specific admin handlers based on subpath
  return NextResponse.json({ ok: true, path: subpath });
}
