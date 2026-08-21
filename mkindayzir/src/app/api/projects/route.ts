import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac.server";
import { z } from "zod";
import { ProjectService } from "@/services/project.service";
import { ProjectStatus } from "@/types";

const projectService = new ProjectService();

const listQuerySchema = z.object({
  status: z.enum(["ACTIVE", "ARCHIVED", "COMPLETED"]).optional(),
  teamId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(10),
});

const createBodySchema = z.object({
  key: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  teamId: z.string().optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const parsed = listQuerySchema.parse(params);

    const result = await projectService.list(parsed, user);
    return NextResponse.json({
      projects: result.items,
      pagination: { page: result.page, limit: result.perPage, total: result.total, totalPages: Math.ceil(result.total / result.perPage) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch projects" } },
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

    const project = await projectService.create(parsed, authResult.session!.user);
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create project" } },
      { status: 500 }
    );
  }
}
