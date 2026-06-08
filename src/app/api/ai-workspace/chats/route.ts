import { NextResponse } from "next/server";
import {
  MAX_WORKSPACE_CHATS,
  createWorkspaceChat,
  listWorkspaceChats,
} from "@/lib/ai/workspace-chats";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chats = await listWorkspaceChats(session.id);
  return NextResponse.json({ chats, limit: MAX_WORKSPACE_CHATS });
}

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chat = await createWorkspaceChat(session.id);
  return NextResponse.json({ chat });
}
