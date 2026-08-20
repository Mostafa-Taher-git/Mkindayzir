import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { z } from "zod";
import { WorkflowService } from "@/services/workflow.service";

const workflowService = new WorkflowService();

const updateBodySchema = z.object({
  name: z.string().min(1).optional(),
  statuses: z.array(z.string()).optional(),
  transitions: z.record(z.string(), z.array(z.string())).optional(),
  isDefault: z.boolean().optional(),
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

    const workflow = await workflowService.getDefault(id, session.user);
    return NextResponse.json({ workflow });
  } catch {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Workflow not found" } },
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

    const workflow = await workflowService.update(id, parsed, authResult.session!.user);
    return NextResponse.json({ workflow });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update workflow" } },
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

    await workflowService.delete(id, authResult.session!.user);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to delete workflow" } },
      { status: 500 }
    );
  }
}
