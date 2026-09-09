import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { markNavBadgeSeen } from "@/lib/nav-badges/service";
import { isNavBadgeHref } from "@/lib/nav-badges/types";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { href?: unknown };
  try {
    body = (await request.json()) as { href?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const href = typeof body.href === "string" ? body.href : "";
  if (!isNavBadgeHref(href)) {
    return NextResponse.json({ error: "Unknown href" }, { status: 400 });
  }

  await markNavBadgeSeen(session.id, href);
  return NextResponse.json({ ok: true });
}
