import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { z } from "zod";
import { ConversationService } from "@/services/conversation.service";
import { AIService } from "@/services/ai.service";
import { getToolDefinitions } from "@/services/ai-tools.service";

const conversationService = new ConversationService();
const aiService = new AIService();

const sendBodySchema = z.object({
  content: z.string().min(1),
  model: z.string().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const conversation = await conversationService.getConversation(id, user);
    const messages = (conversation as { messages?: unknown[] }).messages ?? [];

    return NextResponse.json({ messages });
  } catch {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Conversation not found" } },
      { status: 404 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = sendBodySchema.parse(body);

    const conversation = await conversationService.getConversation(id, user);

    await conversationService.addMessage(id, parsed.content, "USER", user);

    let providerConfig;
    try {
      providerConfig = await aiService.getProviderConfig(user);
    } catch {
      return NextResponse.json(
        { error: { code: "CONFIG_ERROR", message: "AI provider not configured. Please add your API key in Settings." } },
        { status: 400 }
      );
    }

    // Override model if specified in the request
    if (parsed.model) {
      providerConfig.model = parsed.model;
    }

    const toolDefinitions = await getToolDefinitions();

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        let doneSent = false;
        const sendOnce = (event: string, data: unknown) => {
          if (doneSent) return;
          doneSent = true;
          send(event, data);
          controller.close();
        };

        const chatMessages = [
          {
            role: "system",
            content:
              "You are Mkindayzir1, the built-in AI assistant for Mkindayzir, a self-hosted Work OS. Always respond in English unless the user explicitly writes in another language. Be concise and helpful. Refer to yourself as Mkindayzir1 when asked about your name.",
          },
          ...(conversation as { messages?: Array<{ role: string; content: string }> }).messages?.map(
            (msg) => ({
              role: msg.role.toLowerCase(),
              content: msg.content,
            })
          ) ?? [],
          { role: "user", content: parsed.content },
        ];

        try {
          await aiService.streamChat(chatMessages, providerConfig, toolDefinitions, {
            onToken: (token) => {
              send("token", { content: token });
            },
            onToolCall: (toolCall) => {
              send("tool_call", toolCall);
            },
            onToolResult: (toolResult) => {
              send("tool_result", toolResult);
            },
            onDone: async (doneResult) => {
              await conversationService.addMessage(id, doneResult.content, "ASSISTANT", user, {
                model: providerConfig.model,
                tokens: doneResult.tokensUsed,
              });
              sendOnce("done", { messageId: "placeholder" });
            },
            onError: (error) => {
              sendOnce("error", { message: error.message });
            },
          }, user.id);
        } catch (error) {
          sendOnce("error", { message: error instanceof Error ? error.message : "Unknown error" });
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to send message" } },
      { status: 500 }
    );
  }
}
