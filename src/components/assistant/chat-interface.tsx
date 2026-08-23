"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatInput } from "@/components/assistant/chat-input";
import { EmptyState } from "@/components/assistant/empty-state";
import { MessageBubble, TypingIndicator } from "@/components/assistant/message-bubble";
import { ModelSelector } from "@/components/assistant/model-selector";
import { ROUTES } from "@/lib/constants";
import type { Message } from "@/types";

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
  const [selectedModel, setSelectedModel] = React.useState<string>("");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Load the user's default model from settings
  React.useEffect(() => {
    fetch("/api/assistant/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.model && !selectedModel) {
          setSelectedModel(data.model);
        }
      })
      .catch(() => {});
  }, []);

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
        body: JSON.stringify({ content, model: selectedModel || undefined }),
      });

      // Handle non-stream error responses (e.g., no API key configured)
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const errorData = await response.json();
        setIsStreaming(false);
        throw new Error(errorData?.error?.message || "Failed to send message");
      }

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

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
            continue;
          }
          if (line.startsWith("data:")) {
            try {
              const data = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
              if (currentEvent === "token") {
                setStreamingMessage((prev) => prev + String(data.content ?? ""));
              } else if (currentEvent === "done") {
                setStreamingMessage("");
                setIsStreaming(false);
                queryClient.invalidateQueries({
                  queryKey: ["assistant", "messages", conversationId],
                });
                queryClient.invalidateQueries({
                  queryKey: ["assistant", "conversations"],
                });
              } else if (currentEvent === "error") {
                console.error("Stream error:", data.message);
                setIsStreaming(false);
                setStreamingMessage("");
                setErrorMessage(String(data.message ?? "Unknown error"));
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    },
    onError: (error) => {
      setIsStreaming(false);
      setStreamingMessage("");
      setErrorMessage(error instanceof Error ? error.message : "Failed to send message");
    },
  });

  const handleSend = (content: string) => {
    if (!conversationId) {
      router.push(ROUTES.ASSISTANT);
      return;
    }
    setErrorMessage(null);
    sendMutation.mutate(content);
  };

  if (!conversationId) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b px-4 py-2 flex items-center gap-3">
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground whitespace-nowrap">Model:</span>
          <div className="flex-1 max-w-md">
            <ModelSelector
              value={selectedModel}
              onChange={setSelectedModel}
            />
          </div>
        </div>
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
      <div className="border-b px-4 py-2 flex items-center gap-3">
        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground whitespace-nowrap">Model:</span>
        <div className="flex-1 max-w-md">
          <ModelSelector
            value={selectedModel}
            onChange={setSelectedModel}
            disabled={isStreaming}
          />
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0 p-4">
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
          {errorMessage && (
            <div className="mx-auto max-w-3xl border-2 border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive-foreground">
              {errorMessage}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}

export { ChatInterface };
