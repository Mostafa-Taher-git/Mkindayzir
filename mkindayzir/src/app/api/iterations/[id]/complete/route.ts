import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { IterationService } from "@/services/iteration.service";

const iterationService = new IterationService();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authResult = await requirePermission("manage:projects");
    if (authResult.error) return authResult.error;

    const iteration = await iterationService.complete(id, authResult.session!.user);
    return NextResponse.json({ iteration, stats: {} });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to complete iteration" } },
      { status: 500 }
    );
  }
}
