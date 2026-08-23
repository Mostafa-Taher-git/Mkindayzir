import { getSessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { AssistantLayout } from "@/components/assistant/assistant-layout";

export default async function AssistantPage() {
  const user = await getSessionUser();
  let conversations: any[] = [];
  if (user) {
    try {
      const rows = await prisma.conversation.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        include: { messages: { take: 1, orderBy: { createdAt: "desc" } } },
      });
      conversations = rows.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        messages: c.messages.map((m: any) => ({
          ...m,
          createdAt: m.createdAt.toISOString(),
        })),
      }));
    } catch {
      conversations = [];
    }
  }
  return <AssistantLayout initialConversations={conversations} />;
}
