import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { CardService } from "@/services/card.service";

const cardService = new CardService();

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; labelId: string }> }
) {
  try {
    const { id, labelId } = await params;
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await cardService.removeLabel(id, labelId, user);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to remove label" } },
      { status: 500 }
    );
  }
}
