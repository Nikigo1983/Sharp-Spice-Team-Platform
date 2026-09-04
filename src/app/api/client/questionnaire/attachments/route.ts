import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAllowedAttachment } from "@/lib/client-portal/questionnaire-attachment-formats";
import {
  deleteQuestionnaireAttachmentFile,
  saveQuestionnaireAttachmentFile,
} from "@/lib/client-portal/questionnaire-attachment-storage";
import {
  calculateProgress,
  getOrCreateQuestionnaire,
  getPublishedSchema,
  saveQuestionnaireAnswers,
} from "@/lib/client-portal/questionnaire-service";
import { getClientSession } from "@/lib/client-portal/session";
import { isFileAnswer } from "@/lib/client-portal/questionnaire-types";

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
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const record = await getOrCreateQuestionnaire(session);
  if (record.status === "submitted") {
    return NextResponse.json({ error: "ALREADY_SUBMITTED" }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const questionId = String(formData.get("questionId") ?? "");
  const fileEntry = asUploadFile(formData.get("file"));
  if (!questionId || !fileEntry) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const question = getPublishedSchema()
    .sections.flatMap((section) => section.questions)
    .find((item) => item.id === questionId);
  if (!question || question.type !== "file") {
    return NextResponse.json({ error: "UNKNOWN_FIELD" }, { status: 400 });
  }

  const buffer = Buffer.from(await fileEntry.arrayBuffer());
  const allowed = isAllowedAttachment({
    fileName: fileEntry.name || "file",
    contentType: fileEntry.type || "application/octet-stream",
    sizeBytes: buffer.length,
    accept: question.accept,
    maxSizeMb: question.maxSizeMb,
  });
  if (!allowed.ok) {
    return NextResponse.json(
      {
        error:
          allowed.reason === "too_large"
            ? "FILE_TOO_LARGE"
            : "UNSUPPORTED_FILE_TYPE",
      },
      { status: allowed.reason === "too_large" ? 413 : 400 },
    );
  }

  const attachmentId = randomUUID();
  const fileName = (fileEntry.name || "file").slice(0, 255);

  await saveQuestionnaireAttachmentFile(
    session.id,
    attachmentId,
    fileName,
    buffer,
    allowed.mimeType,
  );

  const previous = record.answers[questionId];
  if (isFileAnswer(previous) && previous.id !== attachmentId) {
    void deleteQuestionnaireAttachmentFile(
      session.id,
      previous.id,
      previous.fileName,
    );
  }

  const attachment = {
    id: attachmentId,
    fileName,
    mimeType: allowed.mimeType,
    sizeBytes: buffer.length,
  };

  const updated = await saveQuestionnaireAnswers(session, {
    id: record.id,
    expectedRevision: record.revision,
    answers: { ...record.answers, [questionId]: attachment },
  });

  return NextResponse.json({
    attachment,
    questionnaire: updated,
    progress: calculateProgress(updated.answers),
  });
}

export async function DELETE(request: Request) {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const attachmentId = searchParams.get("id");
  const questionId = searchParams.get("questionId");
  if (!attachmentId || !questionId) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const record = await getOrCreateQuestionnaire(session);
  if (record.status === "submitted") {
    return NextResponse.json({ error: "ALREADY_SUBMITTED" }, { status: 400 });
  }

  const current = record.answers[questionId];
  if (!isFileAnswer(current) || current.id !== attachmentId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  await deleteQuestionnaireAttachmentFile(
    session.id,
    current.id,
    current.fileName,
  );
  const nextAnswers = { ...record.answers };
  delete nextAnswers[questionId];
  const updated = await saveQuestionnaireAnswers(session, {
    id: record.id,
    expectedRevision: record.revision,
    answers: nextAnswers,
  });

  return NextResponse.json({
    ok: true,
    questionnaire: updated,
    progress: calculateProgress(updated.answers),
  });
}
