import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { AIService, ProviderType } from "@/services/ai.service";

const aiService = new AIService();

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Determine provider from user settings (don't need API key to list models)
    const providerName = (user.aiProvider || "openrouter") as ProviderType;

    try {
      const models = await aiService.getAvailableModels(providerName);
      return NextResponse.json({ models });
    } catch {
      // If fetching model list fails, return empty but don't error
      return NextResponse.json({ models: [] });
    }
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch models" } },
      { status: 500 }
    );
  }
}
