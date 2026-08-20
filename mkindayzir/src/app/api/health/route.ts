import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", app: "Mkindayzir", database: "connected" });
  } catch {
    return NextResponse.json(
      { status: "degraded", app: "Mkindayzir", database: "disconnected" },
      { status: 503 }
    );
  }
}
