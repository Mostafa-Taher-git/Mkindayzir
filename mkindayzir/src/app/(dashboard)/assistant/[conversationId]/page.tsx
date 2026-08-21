import { getSessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { AssistantLayout } from "@/components/assistant/assistant-layout";

async function getInitialConversations(userId: string) {
  return prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { messages: { take: 1, orderBy: { createdAt: "desc" } } },
  });
}

async function getConversation(id: string, userId: string) {
  return prisma.conversation.findFirst({
    where: { id, userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const user = await getSessionUser();
  if (!user) notFound();

  const [conversation, conversations] = await Promise.all([
    getConversation(conversationId, user.id),
    getInitialConversations(user.id),
  ]);

  if (!conversation) notFound();

  return (
    <AssistantLayout
      initialConversations={conversations as any}
      conversationId={conversationId}
    />
  );
}
