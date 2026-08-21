import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac.server";
import { z } from "zod";
import { InitiativeService } from "@/services/initiative.service";

const initiativeService = new InitiativeService();

const updateBodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  targetDate: z.string().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const initiative = await initiativeService.get(id, user);
    return NextResponse.json({ initiative, workItems: [] });
  } catch {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Initiative not found" } },
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

    const initiative = await initiativeService.update(id, parsed, authResult.session!.user);
    return NextResponse.json({ initiative });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update initiative" } },
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

    await initiativeService.delete(id, authResult.session!.user);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to delete initiative" } },
      { status: 500 }
    );
  }
}
