import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const profileSchema = z.object({
  displayName: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

const aiSettingsSchema = z.object({
  aiProvider: z.string().optional(),
  aiApiKey: z.string().optional(),
  aiModel: z.string().optional(),
  aiBaseUrl: z.string().optional(),
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ data: user });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const url = new URL(request.url);
    const path = url.pathname.replace("/api/settings", "").replace(/^\//, "");

    if (path === "ai") {
      const parsed = aiSettingsSchema.parse(body);
      const updateData: Record<string, string> = {};
      if (parsed.aiProvider) updateData.aiProvider = parsed.aiProvider;
      if (parsed.aiModel) updateData.aiModel = parsed.aiModel;
      if (parsed.aiApiKey) updateData.aiApiKey = parsed.aiApiKey;
      if (parsed.aiBaseUrl) updateData.aiBaseUrl = parsed.aiBaseUrl;

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: updateData,
        select: { id: true, aiProvider: true, aiModel: true },
      });

      return NextResponse.json({ data: updated });
    }

    const parsed = profileSchema.parse(body);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: parsed,
      select: { id: true, displayName: true, email: true },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to update settings" } }, { status: 500 });
  }
}
