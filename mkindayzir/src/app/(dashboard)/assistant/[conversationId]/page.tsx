import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
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

async function getConversation(id: string) {
  const session = await auth();
  if (!session?.user) return null;

  const res = await fetch(`/api/assistant/conversations/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.conversation ?? null;
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const [conversation, conversations] = await Promise.all([
    getConversation(conversationId),
    getInitialConversations(),
  ]);

  if (!conversation) {
    notFound();
  }

  return (
    <AssistantLayout
      initialConversations={conversations}
      conversationId={conversationId}
    />
  );
}
