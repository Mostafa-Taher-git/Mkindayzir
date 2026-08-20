import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { ConversationService } from "@/services/conversation.service";

const conversationService = new ConversationService();

const updateBodySchema = z.object({
  title: z.string().optional(),
  model: z.string().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const conversation = await conversationService.getConversation(id, session.user);
    const messages = (conversation as { messages?: unknown[] }).messages ?? [];

    return NextResponse.json({ conversation, messages });
  } catch {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Conversation not found" } },
      { status: 404 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateBodySchema.parse(body);

    const conversation = await conversationService.updateConversation(id, parsed, session.user);
    return NextResponse.json({ conversation });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update conversation" } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await conversationService.deleteConversation(id, session.user);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to delete conversation" } },
      { status: 500 }
    );
  }
}
