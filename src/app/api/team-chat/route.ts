import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { notifyTeamChatMessage } from "@/lib/notifications/emit";
import {
  createTeamChatMessage,
  listTeamChatMessages,
} from "@/lib/team-chat/store";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "100");
  const beforeCreatedAt = searchParams.get("before") ?? undefined;
  const afterCreatedAt = searchParams.get("after") ?? undefined;
  const q = searchParams.get("q") ?? undefined;

  const result = await listTeamChatMessages({
    limit,
    beforeCreatedAt,
    afterCreatedAt,
    q,
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { text?: string };
  if (!body?.text || typeof body.text !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const message = await createTeamChatMessage({ text: body.text }, session);
    await notifyTeamChatMessage({
      senderId: session.id,
      senderName: session.name,
      text: message.message_text,
    });
    return NextResponse.json({ message });
  } catch {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }
}
