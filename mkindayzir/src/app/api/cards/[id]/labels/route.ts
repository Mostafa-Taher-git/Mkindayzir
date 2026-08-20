import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { CardService } from "@/services/card.service";

const cardService = new CardService();

const addLabelBodySchema = z.object({
  labelId: z.string(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = addLabelBodySchema.parse(body);

    const label = await cardService.addLabel(id, parsed.labelId, session.user);
    return NextResponse.json({ label }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to add label" } },
      { status: 500 }
    );
  }
}
