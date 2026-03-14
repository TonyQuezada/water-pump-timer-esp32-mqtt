export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (
  pathname.startsWith("/login") ||
  pathname.startsWith("/api/auth") ||
  pathname.startsWith("/manifest") ||
  pathname.startsWith("/sw.js") ||
  pathname.startsWith("/icon")
) {
  return NextResponse.next();
}

  // If not logged in, redirect to login
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
