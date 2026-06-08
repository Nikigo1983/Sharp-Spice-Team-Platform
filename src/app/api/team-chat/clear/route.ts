import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { clearTeamChat } from "@/lib/team-chat/store";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ok = await clearTeamChat(session);
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
