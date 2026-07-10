import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { setTeamChatMessagePinned } from "@/lib/team-chat/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    pinned?: boolean;
  } | null;
  const pinned = body?.pinned !== false;

  const { id } = await context.params;
  const message = await setTeamChatMessagePinned(id, pinned, session);
  if (!message) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ message });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const message = await setTeamChatMessagePinned(id, false, session);
  if (!message) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ message });
}
