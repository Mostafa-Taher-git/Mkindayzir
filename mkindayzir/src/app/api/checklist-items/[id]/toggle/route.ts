import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { ChecklistItemService } from "@/services/checklist-item.service";

const checklistItemService = new ChecklistItemService();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const item = await checklistItemService.toggle(id, user);
    return NextResponse.json({ item });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to toggle checklist item" } },
      { status: 500 }
    );
  }
}
