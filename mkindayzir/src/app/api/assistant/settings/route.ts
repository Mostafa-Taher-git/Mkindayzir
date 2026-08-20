import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getEncryptionKey, encrypt } from "@/lib/encryption";

const patchBodySchema = z.object({
  provider: z.enum(["openrouter", "openai", "anthropic", "custom"]).optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  customBaseUrl: z.string().optional(),
}).refine(
  (data) => {
    if (data.provider === "custom" && !data.customBaseUrl) {
      return false;
    }
    return true;
  },
  {
    message: "customBaseUrl is required when provider is custom",
    path: ["customBaseUrl"],
  }
);

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      provider: user.aiProvider,
      model: user.aiModel,
      apiKeyConfigured: Boolean(user.aiApiKey),
    });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch settings" } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = patchBodySchema.parse(body);

    const updateData: Record<string, unknown> = {};

    if (parsed.provider) {
      updateData.aiProvider = parsed.provider;
    }

    if (parsed.model) {
      updateData.aiModel = parsed.model;
    }

    if (parsed.apiKey) {
      const encryptionKey = getEncryptionKey();
      updateData.aiApiKey = encrypt(parsed.apiKey, encryptionKey);
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
      },
    });

    return NextResponse.json({
      provider: user.aiProvider,
      model: user.aiModel,
      apiKeyConfigured: Boolean(user.aiApiKey),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update settings" } },
      { status: 500 }
    );
  }
}
