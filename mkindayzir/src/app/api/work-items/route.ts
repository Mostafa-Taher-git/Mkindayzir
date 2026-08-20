import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { WorkItemService } from "@/services/work-item.service";

const workItemService = new WorkItemService();

const listQuerySchema = z.object({
  projectId: z.string().optional(),
  status: z.string().optional(),
  assigneeId: z.string().optional(),
  iterationId: z.string().optional(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  type: z.enum(["TASK", "BUG", "FEATURE", "IMPROVEMENT"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(10),
});

const createBodySchema = z.object({
  projectId: z.string(),
  type: z.enum(["TASK", "BUG", "FEATURE", "IMPROVEMENT"]),
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  assigneeId: z.string().optional(),
  iterationId: z.string().optional(),
  initiativeId: z.string().optional(),
  parentId: z.string().optional(),
  storyPoints: z.coerce.number().int().positive().optional(),
  dueDate: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
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

    const result = await workItemService.list(parsed, session.user);
    return NextResponse.json({
      workItems: result.items,
      pagination: { page: result.page, limit: result.perPage, total: result.total, totalPages: Math.ceil(result.total / result.perPage) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch work items" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createBodySchema.parse(body);

    const workItem = await workItemService.create(
      {
        ...parsed,
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
      },
      session.user
    );
    return NextResponse.json({ workItem }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create work item" } },
      { status: 500 }
    );
  }
}
