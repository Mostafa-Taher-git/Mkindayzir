"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatInput } from "@/components/assistant/chat-input";
import { EmptyState } from "@/components/assistant/empty-state";
import { MessageBubble, TypingIndicator } from "@/components/assistant/message-bubble";
import { ROUTES } from "@/lib/constants";
import type { Message } from "@/types";

type SSEEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; data: Record<string, unknown> }
  | { type: "tool_result"; data: Record<string, unknown> }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };

function useConversationMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["assistant", "messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const res = await fetch(`/api/assistant/conversations/${conversationId}/messages`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json() as { messages: Message[] };
      return data.messages;
    },
    enabled: Boolean(conversationId),
  });
}

function ChatInterface({
  conversationId,
}: {
  conversationId: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const [streamingMessage, setStreamingMessage] = React.useState<string>("");
  const [isStreaming, setIsStreaming] = React.useState(false);

  const { data: messages = [], isLoading } = useConversationMessages(conversationId);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessage]);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!conversationId) throw new Error("No conversation selected");
      setIsStreaming(true);
      setStreamingMessage("");

      const response = await fetch(`/api/assistant/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            continue;
          }
          if (line.startsWith("data:")) {
            try {
              const data = JSON.parse(line.slice(5).trim()) as SSEEvent;
              if (data.type === "token") {
                setStreamingMessage((prev) => prev + data.content);
              } else if (data.type === "done") {
                setStreamingMessage("");
                setIsStreaming(false);
                queryClient.invalidateQueries({
                  queryKey: ["assistant", "messages", conversationId],
                });
                queryClient.invalidateQueries({
                  queryKey: ["assistant", "conversations"],
                });
              } else if (data.type === "error") {
                console.error("Stream error:", data.message);
                setIsStreaming(false);
                setStreamingMessage("");
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    },
    onError: () => {
      setIsStreaming(false);
      setStreamingMessage("");
    },
  });

  const handleSend = (content: string) => {
    if (!conversationId) {
      router.push(ROUTES.ASSISTANT);
      return;
    }
    sendMutation.mutate(content);
  };

  if (!conversationId) {
    return (
      <div className="flex h-full flex-col">
        <EmptyState
          onSelectPrompt={() => {
            // Quick actions focus the input by navigating to a new conversation
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1 p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {isLoading ? (
            <p className="text-muted-foreground text-center text-sm">
              Loading messages...
            </p>
          ) : messages.length === 0 && !streamingMessage ? (
            <EmptyState
              onSelectPrompt={() => {
                // Quick actions focus the input
              }}
            />
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}
          {isStreaming && streamingMessage && (
            <MessageBubble
              message={{
                id: "streaming",
                conversationId: conversationId,
                role: "ASSISTANT",
                content: streamingMessage,
                createdAt: new Date().toISOString(),
              }}
            />
          )}
          {isStreaming && !streamingMessage && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}

export { ChatInterface };
