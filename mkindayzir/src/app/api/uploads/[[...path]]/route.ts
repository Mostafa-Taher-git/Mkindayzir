import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { getConfig } from "@/lib/config";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const config = getConfig();
    const uploadDir = join(config.dataDir, "uploads");
    const fileName = `${Date.now()}-${file.name}`;
    const filePath = join(uploadDir, fileName);

    await mkdir(uploadDir, { recursive: true });
    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    return NextResponse.json({
      id: fileName,
      fileName: file.name,
      size: file.size,
      mimeType: file.type,
    }, { status: 201 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await params;
  // TODO: Serve file or list uploads
  return NextResponse.json({ data: null, path: path?.join("/") });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await params;
  // TODO: Delete file
  return NextResponse.json({ ok: true });
}
