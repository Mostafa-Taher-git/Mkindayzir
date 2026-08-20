import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

export default NextAuth(authConfig).auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthenticated = !!req.auth;

  const publicPaths = [
    "/",
    "/login",
    "/register",
    "/forgot-password",
  ];

  const isPublic =
    publicPaths.some(
      (path) => pathname === path || pathname.startsWith("/api/auth") || pathname === "/api/health"
    );

  if (isPublic) {
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|txt|xml|json|css|js|map|woff2?|ttf)).*)",
  ],
};