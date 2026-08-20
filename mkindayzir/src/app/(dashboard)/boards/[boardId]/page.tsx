import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { BoardDetailClient } from "./board-detail-client";

interface BoardDetailPageProps {
  params: Promise<{ boardId: string }>;
}

async function getBoard(boardId: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/boards/${boardId}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

async function getColumns(boardId: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/boards/${boardId}/columns`, {
    cache: "no-store",
  });
  if (!res.ok) return { columns: [] };
  return res.json();
}

async function getCards(boardId: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/cards?boardId=${boardId}`, {
    cache: "no-store",
  });
  if (!res.ok) return { cards: [] };
  return res.json();
}

export default async function BoardDetailPage({ params }: BoardDetailPageProps) {
  const session = await auth();
  if (!session) {
    redirect(ROUTES.LOGIN);
  }

  const { boardId } = await params;
  const { board } = await getBoard(boardId);
  const { columns } = await getColumns(boardId);
  const { cards } = await getCards(boardId);

  if (!board) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Board not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <BoardDetailClient
      board={board}
      columns={columns}
      cards={cards}
      currentUserId={session.user.id}
    />
  );
}
