import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canPreviewInline } from "@/lib/tasks/attachment-formats";
import { readTaskAttachmentFile } from "@/lib/tasks/attachment-storage";
import { getTask, removeTaskAttachment } from "@/lib/tasks/store";

type RouteContext = { params: Promise<{ id: string; attachmentId: string }> };

function findAttachment(task: NonNullable<Awaited<ReturnType<typeof getTask>>>, attachmentId: string) {
  return task.attachments.find((item) => item.id === attachmentId) ?? null;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, attachmentId } = await context.params;
  const task = await getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attachment = findAttachment(task, attachmentId);
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = await readTaskAttachmentFile(attachment.id, attachment.fileName);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const disposition = canPreviewInline(attachment.contentType)
    ? "inline"
    : "attachment";
  const encodedName = encodeURIComponent(attachment.fileName);

  return new NextResponse(new Uint8Array(file.data), {
    status: 200,
    headers: {
      "Content-Type": attachment.contentType,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, attachmentId } = await context.params;
  const existing = await getTask(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const task = await removeTaskAttachment(id, attachmentId, session);
  if (!task) {
    const attachment = findAttachment(existing, attachmentId);
    if (!attachment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ task });
}
