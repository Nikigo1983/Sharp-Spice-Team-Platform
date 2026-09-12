import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canPreviewInline } from "@/lib/clients/document-formats";
import {
  getClientUploadedDocument,
  removeClientUploadedDocument,
} from "@/lib/clients/local-documents";
import { readClientDocumentFile } from "@/lib/clients/document-storage";
import { getClientDetail } from "@/lib/google-sheets/service";

type RouteContext = { params: Promise<{ id: string; docId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, docId } = await context.params;
  const detail = await getClientDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const document = await getClientUploadedDocument(docId, id);
  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const fileName = document.fileName ?? document.name;
  const file = await readClientDocumentFile(document.id, fileName);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contentType = document.contentType ?? file.contentType;
  const disposition = canPreviewInline(contentType) ? "inline" : "attachment";
  const encodedName = encodeURIComponent(fileName);

  return new NextResponse(new Uint8Array(file.data), {
    status: 200,
    headers: {
      "Content-Type": contentType,
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

  const { id, docId } = await context.params;
  const detail = await getClientDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const removed = await removeClientUploadedDocument(docId, id);
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const documents = (await getClientDetail(id))?.documents ?? [];
  return NextResponse.json({ documents });
}
