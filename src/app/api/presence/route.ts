import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPresenceMap } from "@/lib/presence/store";
import { listTeamMembers } from "@/lib/team/store";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const members = await listTeamMembers();
  const presence = await getPresenceMap(members.map((member) => member.id));
  const onlineCount = Object.values(presence).filter((entry) => entry.isOnline)
    .length;

  return NextResponse.json({ presence, onlineCount });
}
