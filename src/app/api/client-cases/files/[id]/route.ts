import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { verifyCaseFileAccessToken } from "@/lib/client-portal/case-file-access-token";
import { readQuestionnaireAttachmentFile } from "@/lib/client-portal/questionnaire-attachment-storage";
import {
  findFileAnswerInRecord,
  getSubmittedForStaff,
  isStaffUploadedDocument,
  staffDocumentsOwnerKey,
} from "@/lib/client-portal/questionnaire-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function resolveDisposition(requestUrl: URL): "inline" | "attachment" {
  const raw = (
    requestUrl.searchParams.get("disposition") ||
    (requestUrl.searchParams.get("download") === "1" ? "attachment" : "inline")
  ).toLowerCase();
  return raw === "attachment" ? "attachment" : "inline";
}

export async function GET(request: Request, context: RouteContext) {
  const requestUrl = new URL(request.url);
  const { id } = await context.params;
  const questionnaireId = requestUrl.searchParams.get("questionnaireId");
  const accessToken = requestUrl.searchParams.get("accessToken");
  const forOffice = requestUrl.searchParams.get("forOffice") === "1";

  if (!questionnaireId) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  let allowed = false;
  if (accessToken) {
    const claims = await verifyCaseFileAccessToken(accessToken);
    allowed = Boolean(
      claims &&
        claims.fileId === id &&
        claims.questionnaireId === questionnaireId,
    );
  } else {
    const session = await getSession();
    allowed = Boolean(session);
  }

  if (!allowed) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const record = await getSubmittedForStaff(questionnaireId);
  if (!record) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const owned = findFileAnswerInRecord(record, id);
  if (!owned) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const ownerKey = isStaffUploadedDocument(record, id)
    ? staffDocumentsOwnerKey(record.id)
    : record.clientPortalUserId;

  const file = await readQuestionnaireAttachmentFile(
    ownerKey,
    owned.id,
    owned.fileName,
  );
  if (!file) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const disposition = resolveDisposition(requestUrl);
  const rawHead = file.data
    .subarray(0, 80)
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();
  const isHtmlWordExport =
    !forOffice &&
    disposition === "inline" &&
    (owned.fileName.toLowerCase().endsWith(".doc") ||
      file.contentType.includes("msword")) &&
    (rawHead.startsWith("<!doctype html") || rawHead.startsWith("<html"));

  const lowerName = owned.fileName.toLowerCase();
  const officeMime = forOffice
    ? lowerName.endsWith(".docx")
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : lowerName.endsWith(".doc")
        ? "application/msword"
        : file.contentType
    : file.contentType;
  const contentType = isHtmlWordExport
    ? "text/html; charset=utf-8"
    : officeMime;
  const contentDisposition =
    disposition === "attachment"
      ? `attachment; filename*=UTF-8''${encodeURIComponent(owned.fileName)}`
      : forOffice
        ? `inline; filename*=UTF-8''${encodeURIComponent(owned.fileName)}`
        : "inline";

  return new Response(new Uint8Array(file.data), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
