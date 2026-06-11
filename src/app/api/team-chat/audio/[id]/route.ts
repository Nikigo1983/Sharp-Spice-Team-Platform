import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { readTeamChatAudio } from "@/lib/team-chat/audio-storage";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const audio = await readTeamChatAudio(id);
  if (!audio) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(audio.data), {
    status: 200,
    headers: {
      "Content-Type": audio.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
