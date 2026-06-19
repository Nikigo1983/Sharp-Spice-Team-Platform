import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canPreviewInline } from "@/lib/tasks/attachment-formats";
import { readTeamChatFile } from "@/lib/team-chat/file-storage";
import { getTeamChatFileMeta } from "@/lib/team-chat/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const meta = await getTeamChatFileMeta(id);
  if (!meta) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = await readTeamChatFile(id, meta.fileName);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contentType = meta.contentType || file.contentType;
  const disposition = canPreviewInline(contentType) ? "inline" : "attachment";
  const encodedName = encodeURIComponent(meta.fileName);

  return new NextResponse(new Uint8Array(file.data), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
