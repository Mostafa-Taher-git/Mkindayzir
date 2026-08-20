import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { CardService } from "@/services/card.service";

const cardService = new CardService();

const listQuerySchema = z.object({
  columnId: z.string().optional(),
  boardId: z.string().optional(),
}).refine((data) => data.columnId || data.boardId, {
  message: "Either columnId or boardId is required",
});

const createBodySchema = z.object({
  columnId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  coverImage: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const parsed = listQuerySchema.parse(params);

    let cards;
    if (parsed.boardId) {
      cards = await cardService.listByBoard(parsed.boardId);
    } else {
      cards = await cardService.list(parsed.columnId!, session.user);
    }
    return NextResponse.json({ cards });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch cards" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createBodySchema.parse(body);

    const card = await cardService.create(
      {
        ...parsed,
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
      },
      session.user
    );
    return NextResponse.json({ card }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create card" } },
      { status: 500 }
    );
  }
}
