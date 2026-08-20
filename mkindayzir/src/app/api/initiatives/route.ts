import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { z } from "zod";
import { InitiativeService } from "@/services/initiative.service";

const initiativeService = new InitiativeService();

const listQuerySchema = z.object({
  projectId: z.string(),
});

const createBodySchema = z.object({
  projectId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  targetDate: z.string().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
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

    const initiatives = await initiativeService.list(parsed.projectId, session.user);
    return NextResponse.json({ initiatives });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch initiatives" } },
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

    const initiative = await initiativeService.create(
      {
        ...parsed,
        targetDate: parsed.targetDate ? new Date(parsed.targetDate) : undefined,
      },
      authResult.session!.user
    );
    return NextResponse.json({ initiative }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create initiative" } },
      { status: 500 }
    );
  }
}
