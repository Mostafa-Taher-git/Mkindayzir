"use client";
import { useNavigate } from "react-router-dom";

import * as React from "react";
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
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = React.useState<string | null>(conversationId ?? null);
  const [selectedModel, setSelectedModel] = React.useState<string>("");

  // Load default model from settings
  React.useEffect(() => {
    fetch("/api/assistant/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.model) setSelectedModel(data.model);
      })
      .catch(() => {});
  }, []);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    navigate(`/assistant/${id}`);
  };

  return (
    <div className="flex h-full overflow-hidden">
      <ConversationList
        initialConversations={initialConversations}
        selectedId={selectedId}
        onSelect={handleSelect}
        selectedModel={selectedModel}
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
