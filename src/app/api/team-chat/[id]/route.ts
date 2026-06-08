import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { deleteTeamChatMessage } from "@/lib/team-chat/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const ok = await deleteTeamChatMessage(id, session);
  if (!ok) {
    return NextResponse.json(
      { error: "Forbidden or not found" },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true });
}
