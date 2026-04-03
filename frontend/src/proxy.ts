import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Auth is enforced client-side via app-shell (Bearer token in localStorage).
// Proxy no longer uses NextAuth; protected routes redirect when no token.
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/transactions/:path*",
  ],
};
