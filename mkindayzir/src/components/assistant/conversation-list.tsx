"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Conversation } from "@/types";

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString();
}

function ConversationList({
  initialConversations,
  selectedId,
  onSelect,
}: {
  initialConversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["assistant", "conversations"],
    queryFn: async () => {
      const res = await fetch("/api/assistant/conversations");
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json() as Promise<{ conversations: Conversation[] }>;
    },
    initialData: { conversations: initialConversations },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/assistant/conversations/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete conversation");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assistant", "conversations"] });
    },
  });

  const handleNewChat = async () => {
    const res = await fetch("/api/assistant/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error("Failed to create conversation");
    const data = await res.json() as { conversation: Conversation };
    queryClient.invalidateQueries({ queryKey: ["assistant", "conversations"] });
    onSelect(data.conversation.id);
  };

  const conversations = data?.conversations ?? [];

  return (
    <div className="flex h-full flex-col border-r">
      <div className="p-3">
        <Button onClick={handleNewChat} className="w-full" size="sm">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mr-2"
          >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
          New Chat
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {conversations.length === 0 ? (
            <p className="text-muted-foreground px-2 py-4 text-center text-sm">
              No conversations yet
            </p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`group flex cursor-pointer items-center justify-between rounded-md px-2 py-2 transition-colors hover:bg-accent ${
                  selectedId === conv.id ? "bg-accent" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {conv.title ?? "New Chat"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(conv.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {conv.model && (
                    <Badge variant="secondary" className="text-[10px]">
                      {conv.model.split("/").pop()}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(conv.id);
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                    <span className="sr-only">Delete</span>
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export { ConversationList };
