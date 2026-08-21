import { NextResponse } from "next/server";
import { loginUser } from "@/services/auth.service";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    const result = await loginUser(email, password);

    if (!result.success) {
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: result.error || "Invalid email or password" } },
        { status: 401 }
      );
    }

    return NextResponse.json({ data: result.user });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST for login" } }, { status: 405 });
}
