import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { ConversationService } from "@/services/conversation.service";

const conversationService = new ConversationService();

const createBodySchema = z.object({
  title: z.string().optional(),
  model: z.string().optional(),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const conversations = await conversationService.listConversations(session.user);
    return NextResponse.json({ conversations });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch conversations" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createBodySchema.parse(body);

    const conversation = await conversationService.createConversation(parsed, session.user);
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create conversation" } },
      { status: 500 }
    );
  }
}
