import { NextResponse } from "next/server";
import { verifyCompactCaseFileToken } from "@/lib/client-portal/case-file-access-token";
import { readQuestionnaireAttachmentFile } from "@/lib/client-portal/questionnaire-attachment-storage";
import {
  findFileAnswerInRecord,
  getSubmittedForStaff,
  isStaffUploadedDocument,
  staffDocumentsOwnerKey,
} from "@/lib/client-portal/questionnaire-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * Short authenticated file URL for Microsoft Word protocol opens.
 * Keep path short — Word rejects ms-word: links with document URLs over ~256 chars.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { token: rawToken } = await context.params;
  const token = decodeURIComponent(rawToken || "").trim();
  const claims = verifyCompactCaseFileToken(token);
  if (!claims) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const record = await getSubmittedForStaff(claims.questionnaireId);
  if (!record) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const owned = findFileAnswerInRecord(record, claims.fileId);
  if (!owned) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const ownerKey = isStaffUploadedDocument(record, claims.fileId)
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

  const lowerName = owned.fileName.toLowerCase();
  const contentType = lowerName.endsWith(".docx")
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : lowerName.endsWith(".doc")
      ? "application/msword"
      : file.contentType || "application/octet-stream";

  return new Response(new Uint8Array(file.data), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(owned.fileName)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
