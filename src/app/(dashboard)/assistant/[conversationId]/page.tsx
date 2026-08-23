
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { AssistantLayout } from "@/components/assistant/assistant-layout";

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();

  const { data, isLoading } = useQuery<{ conversations: any[] }>({
    queryKey: ["assistant", "conversations"],
    queryFn: async () => {
      const res = await fetch("/api/assistant/conversations", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
  });

  const conversations = data?.conversations ?? [];

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading conversation...</div>;
  }

  return (
    <AssistantLayout initialConversations={conversations} conversationId={conversationId} />
  );
}
