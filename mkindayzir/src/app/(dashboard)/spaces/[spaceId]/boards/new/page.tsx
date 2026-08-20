"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { BoardForm } from "@/components/boards/board-form";

function NewBoardPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const router = useRouter();
  const [spaceId, setSpaceId] = React.useState<string>("");

  React.useEffect(() => {
    params.then((p) => setSpaceId(p.spaceId));
  }, [params]);

  if (!spaceId) return null;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">New Board</h1>
        <p className="text-muted-foreground mt-1">
          Create a new board in this space
        </p>
      </div>
      <BoardForm
        spaceId={spaceId}
        onSuccess={(board) => router.push(`/dashboard/boards/${board.id}`)}
      />
    </div>
  );
}

export default NewBoardPage;
