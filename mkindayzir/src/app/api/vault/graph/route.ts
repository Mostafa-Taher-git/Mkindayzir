import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { VaultService } from "@/services/vault.service";

const vaultService = new VaultService();

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { nodes, links } = await vaultService.getGraph(user);
    return NextResponse.json({ nodes, links });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch graph" } },
      { status: 500 }
    );
  }
}
