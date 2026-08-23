import { useParams, useNavigate } from "react-router-dom";

import * as React from "react";

import { BoardForm } from "@/components/boards/board-form";

export default function NewBoardPage() {
  // react-router: route params come from useParams(), not a prop.
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();

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
        onSuccess={(board) => navigate(`/boards/${board.id}`)}
      />
    </div>
  );
}
