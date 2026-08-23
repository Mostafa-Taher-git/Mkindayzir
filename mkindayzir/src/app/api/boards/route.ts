import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { z } from "zod";
import { BoardService } from "@/services/board.service";

const boardService = new BoardService();

const listQuerySchema = z.object({
  spaceId: z.string().optional(),
});

const createBodySchema = z.object({
  spaceId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  background: z.string().optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const parsed = listQuerySchema.parse(params);

    const boards = parsed.spaceId
      ? await boardService.list(parsed.spaceId, user)
      : await boardService.listAll(user);
    return NextResponse.json({ boards });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch boards" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createBodySchema.parse(body);

    const board = await boardService.create(parsed, user);
    return NextResponse.json({ board }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create board" } },
      { status: 500 }
    );
  }
}
