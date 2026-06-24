import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  AI_REQUEST_STATS_DAYS,
  countAiUserMessagesByUserId,
} from "@/lib/dashboard/ai-request-stats";
import { getPresenceMap } from "@/lib/presence/store";
import { canDeleteTeamMembers } from "@/lib/team/permissions";
import { listTeamMembers } from "@/lib/team/store";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const members = await listTeamMembers();
  const memberIds = members.map((member) => member.id);
  const [presence, aiCounts] = await Promise.all([
    getPresenceMap(memberIds),
    countAiUserMessagesByUserId(AI_REQUEST_STATS_DAYS, memberIds),
  ]);

  const enrichedMembers = members.map((member) => ({
    ...member,
    isOnline: presence[member.id]?.isOnline ?? false,
    lastActiveAt: presence[member.id]?.lastActiveAt || null,
    aiRequestsThisMonth: aiCounts[member.id] ?? 0,
  }));
  const onlineCount = enrichedMembers.filter((member) => member.isOnline).length;

  return NextResponse.json({
    members: enrichedMembers,
    canDelete: canDeleteTeamMembers(session),
    onlineCount,
  });
}
