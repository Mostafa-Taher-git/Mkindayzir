import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { z } from "zod";
import { LabelService } from "@/services/label.service";

const labelService = new LabelService();

const createBodySchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
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

    const labels = await labelService.list(id);
    return NextResponse.json({ labels });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch labels" } },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authResult = await requirePermission("manage:projects");
    if (authResult.error) return authResult.error;

    const body = await request.json();
    const parsed = createBodySchema.parse(body);

    const label = await labelService.create({ ...parsed, projectId: id }, authResult.session!.user);
    return NextResponse.json({ label }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create label" } },
      { status: 500 }
    );
  }
}
