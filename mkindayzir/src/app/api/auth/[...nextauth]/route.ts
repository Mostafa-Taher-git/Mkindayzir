import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: { code: "NOT_FOUND", message: "Auth endpoint not found" } }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ error: { code: "NOT_FOUND", message: "Auth endpoint not found" } }, { status: 404 });
}

export async function PATCH() {
  return NextResponse.json({ error: { code: "NOT_FOUND", message: "Auth endpoint not found" } }, { status: 404 });
}

export async function DELETE() {
  return NextResponse.json({ error: { code: "NOT_FOUND", message: "Auth endpoint not found" } }, { status: 404 });
}
