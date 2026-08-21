import 'server-only';

import { cookies } from 'next/headers';
import bcrypt from 'bcrypt';
import prisma from './prisma';
import { getConfig } from './config';

const SESSION_COOKIE = 'mkindayzir_session';

export async function hashPassword(password: string): Promise<string> {
  const rounds = getConfig().bcryptRounds;
  return bcrypt.hash(password, rounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<string> {
  const token = generateSecureToken(64);
  const expiresAt = new Date(Date.now() + getConfig().sessionMaxAge * 1000);

  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: getConfig().sessionMaxAge,
    path: '/',
  });

  return token;
}

export async function getSession(): Promise<{ userId: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { select: { id: true, status: true } } },
  });

  if (!session || session.expiresAt < new Date() || session.user.status !== 'ACTIVE') {
    await deleteSession(token);
    return null;
  }

  return { userId: session.userId };
}

export async function getSessionUser() {
  const session = await getSession();
  if (!session) return null;

  return prisma.user.findUnique({
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
}

export async function deleteSession(token?: string): Promise<void> {
  const cookieStore = await cookies();
  const sessionToken = token || cookieStore.get(SESSION_COOKIE)?.value;

  if (sessionToken) {
    await prisma.session.deleteMany({
      where: { token: sessionToken },
    });
  }

  cookieStore.delete(SESSION_COOKIE);
}

export async function getUserSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function deleteUserSession(sessionId: string, userId: string) {
  await prisma.session.deleteMany({
    where: { id: sessionId, userId },
  });
}

function generateSecureToken(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Buffer.from(array).toString('hex');
}
