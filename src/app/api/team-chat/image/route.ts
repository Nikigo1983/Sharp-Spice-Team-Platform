import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { notifyTeamChatMessage } from "@/lib/notifications/emit";
import { normalizeTeamChatImageContentType } from "@/lib/team-chat/image-storage";
import { createImageTeamChatMessage } from "@/lib/team-chat/store";

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

  const imageEntry = formData.get("image");
  if (!(imageEntry instanceof File)) {
    return NextResponse.json({ error: "Missing image file" }, { status: 400 });
  }

  const contentType = normalizeTeamChatImageContentType(
    imageEntry.type || "image/png",
  );
  if (!contentType) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
  }

  const buffer = Buffer.from(await imageEntry.arrayBuffer());
  const caption = String(formData.get("text") ?? formData.get("caption") ?? "");
  const replyToId = String(formData.get("replyToId") ?? "").trim() || undefined;

  try {
    const message = await createImageTeamChatMessage(
      session,
      buffer,
      contentType,
      caption,
      replyToId,
    );

    await notifyTeamChatMessage({
      senderId: session.id,
      senderName: session.name,
      text: message.message_text,
      isImage: true,
    });

    return NextResponse.json({ message });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save image message";
    const status = message.includes("large") ? 413 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
