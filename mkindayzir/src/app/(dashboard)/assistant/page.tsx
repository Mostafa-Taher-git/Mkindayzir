import { auth } from "@/lib/auth";
import { AssistantLayout } from "@/components/assistant/assistant-layout";

async function getInitialConversations() {
  const session = await auth();
  if (!session?.user) return [];

  const res = await fetch("/api/assistant/conversations", {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.conversations ?? [];
}

export default async function AssistantPage() {
  const conversations = await getInitialConversations();

  return <AssistantLayout initialConversations={conversations} />;
}
