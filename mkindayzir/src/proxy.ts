import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export default async function proxy(request: Request) {
  const { pathname } = new URL(request.url);

  const publicPaths = [
    '/',
    '/login',
    '/register',
    '/forgot-password',
  ];

  const isPublic =
    publicPaths.some(
      (path) => pathname === path || pathname.startsWith('/api/auth') || pathname === '/api/health'
    );

  if (isPublic) {
    return NextResponse.next();
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|txt|xml|json|css|js|map|woff2?|ttf)).*)',
  ],
};
