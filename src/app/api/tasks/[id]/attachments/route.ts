import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { addTaskAttachment, getTask } from "@/lib/tasks/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await getTask(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

  const buffer = Buffer.from(await fileEntry.arrayBuffer());

  try {
    const task = await addTaskAttachment(
      id,
      {
        buffer,
        fileName: fileEntry.name || "file",
        contentType: fileEntry.type || "application/octet-stream",
        size: buffer.length,
      },
      session,
    );

    if (!task) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save attachment";
    const status =
      message === "File too large"
        ? 413
        : message === "Too many attachments" || message === "Unsupported file type"
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
