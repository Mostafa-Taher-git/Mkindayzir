import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/crypto";
import prisma from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { z } from "zod";

const SetupSchema = z.object({
  mode: z.enum(["personal", "team", "enterprise"]),
  email: z.string().email(),
  displayName: z.string().min(1),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = SetupSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: result.error.issues[0]?.message } },
        { status: 400 }
      );
    }

    const { mode, email, displayName, password } = result.data;

    // Check if admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
    });

    if (existingAdmin) {
      return NextResponse.json(
        { error: { code: "ALREADY_SETUP", message: "Setup has already been completed" } },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        displayName,
        role: "ADMIN",
        status: "ACTIVE",
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Setup failed";
    console.error("Setup error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Check if setup is needed
  try {
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
    });

    return NextResponse.json({ setupComplete: !!admin });
  } catch {
    return NextResponse.json({ setupComplete: false });
  }
}
