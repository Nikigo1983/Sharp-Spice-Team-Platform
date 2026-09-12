import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  addClientUploadedDocument,
  listClientUploadedDocuments,
} from "@/lib/clients/local-documents";
import { getClientDetail } from "@/lib/google-sheets/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const detail = await getClientDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const documents = await listClientUploadedDocuments(id);
  return NextResponse.json({ documents });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const detail = await getClientDetail(id);
  if (!detail) {
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
    await addClientUploadedDocument(id, session.name, {
      buffer,
      fileName: fileEntry.name || "file",
      contentType: fileEntry.type || "application/octet-stream",
      size: buffer.length,
    });

    const updated = await getClientDetail(id);
    return NextResponse.json({ documents: updated?.documents ?? [] });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save document";
    const status =
      message.includes("слишком большой")
        ? 413
        : message.includes("Слишком много") || message.includes("Неподдерживаемый")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
