import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listPinnedTeamChatMessages } from "@/lib/team-chat/store";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messages = await listPinnedTeamChatMessages();
  return NextResponse.json({ messages });
}
