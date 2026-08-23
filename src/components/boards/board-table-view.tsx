
import * as React from "react";
import { BoardCard, BoardColumn } from "@/types";

interface BoardTableViewProps {
  columns: BoardColumn[];
  cards: BoardCard[];
  onCardClick: (id: string) => void;
}

function BoardTableView({ columns, cards, onCardClick }: BoardTableViewProps) {
  const cardsByColumn = columns.reduce<Record<string, BoardCard[]>>((acc, col) => {
    acc[col.id] = cards.filter((c) => c.columnId === col.id);
    return acc;
  }, {});

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] bg-muted/50">
        {columns.map((col) => (
          <div key={col.id} className="p-2 border-r last:border-r-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase">{col.name}</p>
            <p className="text-xs text-muted-foreground">{cardsByColumn[col.id]?.length ?? 0}</p>
          </div>
        ))}
      </div>
      <div className="divide-y">
        {cards.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            No cards in this board yet.
          </div>
        ) : (
          cards.map((card) => {
            const col = columns.find((c) => c.id === card.columnId);
            return (
              <button
                key={card.id}
                onClick={() => onCardClick(card.id)}
                className="w-full text-left p-3 hover:bg-accent/50 transition-colors flex items-start justify-between gap-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{card.title}</p>
                  {card.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {card.description}
                    </p>
                  )}
                </div>
                {col && (
                  <span className="text-xs text-muted-foreground shrink-0">{col.name}</span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export { BoardTableView };
