import { hashPassword, verifyPassword, createSession, deleteSession, getSession } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getConfig } from '@/lib/config';
import { z } from 'zod';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export async function loginUser(email: string, password: string) {
  const result = LoginSchema.safeParse({ email, password });
  if (!result.success) {
    return { success: false as const, error: 'Invalid input' };
  }

  const user = await prisma.user.findUnique({
    where: { email: result.data.email.toLowerCase() },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      displayName: true,
      role: true,
      status: true,
    },
  });

  if (!user || user.status !== 'ACTIVE') {
    return { success: false as const, error: 'Invalid email or password' };
  }

  const isValid = await verifyPassword(result.data.password, user.passwordHash);
  if (!isValid) {
    return { success: false as const, error: 'Invalid email or password' };
  }

  const token = await createSession(user.id);

  return {
    success: true as const,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role as 'ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER',
    },
    token,
  };
}

export async function logoutUser() {
  await deleteSession();
}

export async function getCurrentUser() {
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
