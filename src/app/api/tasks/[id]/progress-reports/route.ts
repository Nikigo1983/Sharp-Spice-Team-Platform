import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { addTaskProgressReport, getTaskForUser } from "@/lib/tasks/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await getTaskForUser(id, session);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const commentEntry = formData.get("comment");
  const comment =
    typeof commentEntry === "string" ? commentEntry : "";

  const fileEntry = formData.get("file");
  let file:
    | { buffer: Buffer; fileName: string; contentType: string; size: number }
    | undefined;

  if (fileEntry instanceof File && fileEntry.size > 0) {
    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    file = {
      buffer,
      fileName: fileEntry.name || "file",
      contentType: fileEntry.type || "application/octet-stream",
      size: buffer.length,
    };
  }

  try {
    const task = await addTaskProgressReport(
      id,
      { comment, file },
      session,
    );

    if (!task) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save report";
    const status =
      message === "File too large"
        ? 413
        : message === "Comment required" ||
            message === "Comment too long" ||
            message === "Too many reports" ||
            message === "Unsupported file type"
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
