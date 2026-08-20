import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { z } from "zod";
import { WorkItemService } from "@/services/work-item.service";

const workItemService = new WorkItemService();

const bulkBodySchema = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(["update", "delete", "assign", "transition"]),
  data: z.record(z.string(), z.any()).optional(),
});

export async function POST(request: Request) {
  try {
    const authResult = await requirePermission("manage:work_items");
    if (authResult.error) return authResult.error;

    const body = await request.json();
    const parsed = bulkBodySchema.parse(body);

    const result = await workItemService.bulkUpdate(parsed.ids, { action: parsed.action, data: parsed.data }, authResult.session!.user);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to perform bulk action" } },
      { status: 500 }
    );
  }
}
