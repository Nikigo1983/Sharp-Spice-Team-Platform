import { NextResponse, type NextRequest } from "next/server";
import { canAccessPath } from "@/lib/auth/permissions";
import { getSessionFromToken } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/login", "/join", "/api/webhooks"];

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/clients",
  "/new-formgrid-clients",
  "/crm",
  "/ai-workspace",
  "/knowledge-base",
  "/tasks",
  "/calendar",
  "/meeting-recordings",
  "/team-chat",
  "/relocation",
  "/checkups-erevan",
  "/analytics",
  "/team",
  "/settings",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("ss_session")?.value;
  const session = await getSessionFromToken(token);

  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = session ? "/dashboard" : "/login";
    return NextResponse.redirect(url);
  }

  if (isPublicPath(pathname)) {
    if (session && pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (isProtectedPath(pathname)) {
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    if (!canAccessPath(session.role, pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/join",
    "/join/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/clients",
    "/clients/:path*",
    "/new-formgrid-clients",
    "/new-formgrid-clients/:path*",
    "/crm",
    "/crm/:path*",
    "/ai-workspace",
    "/ai-workspace/:path*",
    "/knowledge-base",
    "/knowledge-base/:path*",
    "/tasks",
    "/tasks/:path*",
    "/calendar",
    "/calendar/:path*",
    "/meeting-recordings",
    "/meeting-recordings/:path*",
    "/team-chat",
    "/team-chat/:path*",
    "/relocation",
    "/relocation/:path*",
    "/checkups-erevan",
    "/checkups-erevan/:path*",
    "/analytics",
    "/analytics/:path*",
    "/team",
    "/team/:path*",
    "/settings",
    "/settings/:path*",
  ],
};
