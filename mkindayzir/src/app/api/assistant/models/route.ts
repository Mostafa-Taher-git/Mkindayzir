import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AIService, ProviderType } from "@/services/ai.service";

const aiService = new AIService();

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerConfig = await aiService.getProviderConfig(session.user);
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
