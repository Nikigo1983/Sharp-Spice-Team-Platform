import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getNavBadgesForUser } from "@/lib/nav-badges/service";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const badges = await getNavBadgesForUser(session.id);
  return NextResponse.json({ badges });
}
