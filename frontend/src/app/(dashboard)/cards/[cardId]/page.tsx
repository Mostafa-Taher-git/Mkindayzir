
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { CardDetailClient } from "./card-detail-client";

export default function CardDetailPage() {
  const { cardId } = useParams<{ cardId: string }>();

  const { data, isLoading } = useQuery<{ card: any }>({
    queryKey: ["card", cardId],
    enabled: Boolean(cardId),
    queryFn: async () => {
      const res = await fetch(`/api/cards/${cardId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch card");
      return res.json();
    },
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading card...</div>;
  }

  const card = data?.card;

  if (!card) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Card not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <CardDetailClient card={card} />;
}
