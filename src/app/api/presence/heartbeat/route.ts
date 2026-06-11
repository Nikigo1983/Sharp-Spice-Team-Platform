import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { touchUserPresence } from "@/lib/presence/store";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lastActiveAt = await touchUserPresence(session.id);
  return NextResponse.json({ ok: true, lastActiveAt });
}
