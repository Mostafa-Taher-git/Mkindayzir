import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac.server";
import { z } from "zod";
import { VaultService } from "@/services/vault.service";

const vaultService = new VaultService();

const createBodySchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tags = await vaultService.listTags(user);
    return NextResponse.json({ tags });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch tags" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requirePermission("manage:vault");
    if (authResult.error) return authResult.error;

    const body = await request.json();
    const parsed = createBodySchema.parse(body);

    const tag = await vaultService.createTag(parsed.name, authResult.session!.user, parsed.color);
    return NextResponse.json({ tag }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create tag" } },
      { status: 500 }
    );
  }
}
