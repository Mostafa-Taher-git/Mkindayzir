import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { ColumnService } from "@/services/column.service";

const columnService = new ColumnService();

const reorderBodySchema = z.object({
  orderedIds: z.array(z.string()),
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
    const parsed = reorderBodySchema.parse(body);

    await columnService.reorder(id, parsed.orderedIds, session.user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to reorder columns" } },
      { status: 500 }
    );
  }
}
