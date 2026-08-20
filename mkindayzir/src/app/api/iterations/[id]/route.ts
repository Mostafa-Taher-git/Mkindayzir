import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { z } from "zod";
import { IterationService } from "@/services/iteration.service";

const iterationService = new IterationService();

const updateBodySchema = z.object({
  name: z.string().min(1).optional(),
  goal: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["PLANNING", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const iteration = await iterationService.get(id, session.user);
    return NextResponse.json({ iteration });
  } catch {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Iteration not found" } },
      { status: 404 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authResult = await requirePermission("manage:projects");
    if (authResult.error) return authResult.error;

    const body = await request.json();
    const parsed = updateBodySchema.parse(body);

    const iteration = await iterationService.update(id, parsed, authResult.session!.user);
    return NextResponse.json({ iteration });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update iteration" } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authResult = await requirePermission("manage:projects");
    if (authResult.error) return authResult.error;

    await iterationService.delete(id, authResult.session!.user);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to delete iteration" } },
      { status: 500 }
    );
  }
}
