import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listTeamChatSharedMedia } from "@/lib/team-chat/store";
import type { TeamChatSharedMediaType } from "@/lib/team-chat/types";

const ALLOWED_TYPES = new Set<TeamChatSharedMediaType>([
  "image",
  "file",
  "voice",
  "links",
]);

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as TeamChatSharedMediaType | null;
  if (!type || !ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid media type" }, { status: 400 });
  }

  const limit = Number(searchParams.get("limit") ?? "60");
  const beforeCreatedAt = searchParams.get("before") ?? undefined;

  const result = await listTeamChatSharedMedia({
    type,
    limit,
    beforeCreatedAt,
  });

  return NextResponse.json(result);
}
