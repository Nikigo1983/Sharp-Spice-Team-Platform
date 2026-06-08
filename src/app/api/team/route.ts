import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canDeleteTeamMembers } from "@/lib/team/permissions";
import { listTeamMembers } from "@/lib/team/store";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const members = await listTeamMembers();
  return NextResponse.json({
    members,
    canDelete: canDeleteTeamMembers(session),
  });
}
