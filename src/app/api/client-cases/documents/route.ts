import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  addStaffCaseDocument,
  deleteStaffCaseDocument,
  readStaffDocuments,
} from "@/lib/client-portal/questionnaire-service";

export const runtime = "nodejs";

type UploadFile = {
  name: string;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function asUploadFile(entry: FormDataEntryValue | null): UploadFile | null {
  if (!entry || typeof entry === "string") return null;
  const candidate = entry as {
    name?: unknown;
    type?: unknown;
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };
  if (typeof candidate.arrayBuffer !== "function") return null;
  const name =
    typeof candidate.name === "string" && candidate.name.trim()
      ? candidate.name.trim()
      : "file";
  const type =
    typeof candidate.type === "string" && candidate.type
      ? candidate.type
      : "application/octet-stream";
  return { name, type, arrayBuffer: () => candidate.arrayBuffer!() };
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const questionnaireId = String(formData.get("questionnaireId") ?? "");
  const fileEntry = asUploadFile(formData.get("file"));
  if (!questionnaireId || !fileEntry) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    const { record, document } = await addStaffCaseDocument(questionnaireId, {
      fileName: fileEntry.name || `file-${randomUUID()}`,
      contentType: fileEntry.type,
      data: buffer,
      uploadedByUserId: session.id,
      uploadedByName: session.name,
    });
    return NextResponse.json({
      document,
      documents: readStaffDocuments(record.answers),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPLOAD_FAILED";
    const status =
      message === "NOT_FOUND"
        ? 404
        : message === "FILE_TOO_LARGE"
          ? 413
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const questionnaireId = searchParams.get("questionnaireId");
  const documentId = searchParams.get("id");
  if (!questionnaireId || !documentId) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const record = await deleteStaffCaseDocument(questionnaireId, documentId);
    return NextResponse.json({
      ok: true,
      documents: readStaffDocuments(record.answers),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DELETE_FAILED";
    const status = message === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
