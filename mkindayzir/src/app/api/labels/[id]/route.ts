import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { z } from "zod";
import { LabelService } from "@/services/label.service";

const labelService = new LabelService();

const updateBodySchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
});

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

    const label = await labelService.update(id, parsed, authResult.session!.user);
    return NextResponse.json({ label });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update label" } },
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

    await labelService.delete(id, authResult.session!.user);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to delete label" } },
      { status: 500 }
    );
  }
}
