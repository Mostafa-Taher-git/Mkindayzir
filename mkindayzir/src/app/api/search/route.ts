import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { SearchService } from "@/services/search.service";

const searchService = new SearchService();

const searchQuerySchema = z.object({
  q: z.string().min(1),
  types: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const parsed = searchQuerySchema.parse(params);

    const types = parsed.types ? parsed.types.split(",").filter(Boolean) : undefined;

    const results = await searchService.search(session.user, parsed.q, types);
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to search" } },
      { status: 500 }
    );
  }
}
