import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { CardDetailClient } from "./card-detail-client";

interface CardDetailPageProps {
  params: Promise<{ cardId: string }>;
}

async function getCard(cardId: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/cards/${cardId}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function CardDetailPage({ params }: CardDetailPageProps) {
  const user = await getSessionUser();
  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  const { cardId } = await params;
  const { card } = await getCard(cardId);

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
