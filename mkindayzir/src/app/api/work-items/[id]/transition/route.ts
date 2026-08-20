import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { z } from "zod";
import { WorkItemService } from "@/services/work-item.service";

const workItemService = new WorkItemService();

const transitionBodySchema = z.object({
  status: z.string(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authResult = await requirePermission("edit:work_items");
    if (authResult.error) return authResult.error;

    const body = await request.json();
    const parsed = transitionBodySchema.parse(body);

    const workItem = await workItemService.transition(id, parsed.status, authResult.session!.user);
    return NextResponse.json({ workItem });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to transition work item" } },
      { status: 500 }
    );
  }
}
