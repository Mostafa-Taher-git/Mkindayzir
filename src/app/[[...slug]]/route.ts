import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  let p = url.pathname;
  if (p === "/") p = "/index.html";
  if (!p.endsWith(".html")) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.join(process.cwd(), "public", p);
  try {
    const html = await readFile(filePath, "utf8");
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
