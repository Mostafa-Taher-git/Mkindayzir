import { NextResponse } from 'next/server';
import { getSession, deleteSession } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ data: null });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      status: true,
      avatar: true,
      timezone: true,
      aiProvider: true,
      aiModel: true,
    },
  });

  return NextResponse.json({ data: user });
}

export async function DELETE() {
  await deleteSession();
  return NextResponse.json({ data: true });
}
