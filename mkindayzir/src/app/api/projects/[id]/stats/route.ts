import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ProjectService } from "@/services/project.service";

const projectService = new ProjectService();

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

    const stats = await projectService.getStats(id);
    return NextResponse.json(stats);
  } catch {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Project not found" } },
      { status: 404 }
    );
  }
}
