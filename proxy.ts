import { NextResponse, type NextRequest } from "next/server";
import { USER_COOKIE, userById } from "./lib/users";

/**
 * Optimistic access check (PRD §8, §11 Access control; EV-A1). Sellers never reach the Register
 * screen or Karandeep's brief. Pages and actions re-check on the server as well.
 */
export function proxy(request: NextRequest) {
  const user = userById(request.cookies.get(USER_COOKIE)?.value);
  const { pathname } = request.nextUrl;
  const karandeepOnly = pathname.startsWith("/register") || /^\/deal\/[^/]+\/brief(\/|$)/.test(pathname);
  if (karandeepOnly && user.role !== "karandeep") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "?denied=1";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/register/:path*", "/deal/:path*"] };
