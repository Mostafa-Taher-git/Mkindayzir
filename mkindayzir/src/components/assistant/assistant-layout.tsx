"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ConversationList } from "@/components/assistant/conversation-list";
import { ChatInterface } from "@/components/assistant/chat-interface";
import type { Conversation } from "@/types";

function AssistantLayout({
  initialConversations,
  conversationId,
}: {
  initialConversations: Conversation[];
  conversationId?: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState<string | null>(conversationId ?? null);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    router.push(`/assistant/${id}`);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      <ConversationList
        initialConversations={initialConversations}
        selectedId={selectedId}
        onSelect={handleSelect}
      />
      <div className="flex-1">
        {selectedId ? (
          <ChatInterface key={selectedId} conversationId={selectedId} />
        ) : (
          <ChatInterface conversationId={null} />
        )}
      </div>
    </div>
  );
}

export { AssistantLayout };
