import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { VaultService } from "@/services/vault.service";

const vaultService = new VaultService();

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

    const note = await vaultService.archiveNote(id, user);
    return NextResponse.json({ note });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to archive note" } },
      { status: 500 }
    );
  }
}
