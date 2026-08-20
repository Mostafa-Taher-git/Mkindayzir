import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { z } from "zod";
import { IterationService } from "@/services/iteration.service";

const iterationService = new IterationService();

const listQuerySchema = z.object({
  projectId: z.string(),
});

const createBodySchema = z.object({
  projectId: z.string(),
  name: z.string().min(1),
  goal: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
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

    const iterations = await iterationService.list(parsed.projectId, session.user);
    return NextResponse.json({ iterations });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch iterations" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requirePermission("manage:projects");
    if (authResult.error) return authResult.error;

    const body = await request.json();
    const parsed = createBodySchema.parse(body);

    const iteration = await iterationService.create(
      {
        ...parsed,
        startDate: parsed.startDate ? new Date(parsed.startDate) : undefined,
        endDate: parsed.endDate ? new Date(parsed.endDate) : undefined,
      },
      authResult.session!.user
    );
    return NextResponse.json({ iteration }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create iteration" } },
      { status: 500 }
    );
  }
}
