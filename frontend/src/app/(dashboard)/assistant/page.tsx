
import { useQuery } from "@tanstack/react-query";
import { AssistantLayout } from "@/components/assistant/assistant-layout";
import { api } from "@/lib/api";

export default function AssistantPage() {
  const { data, isLoading } = useQuery<{ conversations: any[] }>({
    queryKey: ["assistant", "conversations"],
    queryFn: async () => {
      const res = await api.get<{ conversations: any[] }>("/api/assistant/conversations");
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
  });

  const conversations = data?.conversations ?? [];

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading assistant...</div>;
  }

  return <AssistantLayout initialConversations={conversations} />;
}