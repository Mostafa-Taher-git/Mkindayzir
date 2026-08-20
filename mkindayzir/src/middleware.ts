import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
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
