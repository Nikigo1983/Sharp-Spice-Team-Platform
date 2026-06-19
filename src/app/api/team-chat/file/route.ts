import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { notifyTeamChatMessage } from "@/lib/notifications/emit";
import { normalizeTeamChatFileContentType } from "@/lib/team-chat/file-storage";
import { createFileTeamChatMessage } from "@/lib/team-chat/store";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const fileName = fileEntry.name?.trim() || "file";
  const contentType = normalizeTeamChatFileContentType(
    fileEntry.type || "application/octet-stream",
    fileName,
  );
  if (!contentType) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  const buffer = Buffer.from(await fileEntry.arrayBuffer());

  try {
    const message = await createFileTeamChatMessage(
      session,
      buffer,
      fileName,
      contentType,
    );

    await notifyTeamChatMessage({
      senderId: session.id,
      senderName: session.name,
      text: message.file_name ?? "Файл",
      isFile: true,
    });

    return NextResponse.json({ message });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save file message";
    const status = message.includes("large") ? 413 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
