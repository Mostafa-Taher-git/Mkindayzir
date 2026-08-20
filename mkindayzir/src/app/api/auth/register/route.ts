import { NextResponse } from "next/server";
import { RegisterSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/crypto";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = RegisterSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email: result.data.email.toLowerCase() },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = hashPassword(result.data.password);

    const user = await prisma.user.create({
      data: {
        email: result.data.email.toLowerCase(),
        passwordHash,
        displayName: result.data.displayName,
        role: "MEMBER",
        status: "ACTIVE",
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}
