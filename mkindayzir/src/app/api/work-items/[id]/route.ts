import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { WorkItemService } from "@/services/work-item.service";

const workItemService = new WorkItemService();

const updateBodySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  assigneeId: z.string().optional(),
  iterationId: z.string().optional(),
  initiativeId: z.string().optional(),
  parentId: z.string().optional(),
  storyPoints: z.coerce.number().int().positive().optional(),
  dueDate: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
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

    const workItem = await workItemService.get(id, session.user);
    return NextResponse.json({ workItem });
  } catch {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Work item not found" } },
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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateBodySchema.parse(body);

    const workItem = await workItemService.update(id, parsed, session.user);
    return NextResponse.json({ workItem });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update work item" } },
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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await workItemService.delete(id, session.user);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to delete work item" } },
      { status: 500 }
    );
  }
}
