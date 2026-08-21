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

    const providerConfig = await aiService.getProviderConfig(user);
    const provider = providerConfig.name as ProviderType;
    const models = await aiService.getAvailableModels(provider);

    return NextResponse.json({ models });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch models" } },
      { status: 500 }
    );
  }
}
