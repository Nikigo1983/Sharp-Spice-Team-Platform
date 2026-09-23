import { verifyCompactCaseFileToken } from "@/lib/client-portal/case-file-office-token";
import { readQuestionnaireAttachmentFile } from "@/lib/client-portal/questionnaire-attachment-storage";
import {
  findFileAnswerInRecord,
  getSubmittedForStaff,
  isStaffUploadedDocument,
  staffDocumentsOwnerKey,
} from "@/lib/client-portal/questionnaire-service";

/**
 * Serve the case attachment for a compact Word-open token.
 * Used by short `/w/[token]` and `/w/[token]/document.doc(x)` routes.
 */
export async function serveCaseFileFromCompactToken(
  rawToken: string,
): Promise<Response> {
  const token = decodeURIComponent(rawToken || "").trim();
  const claims = verifyCompactCaseFileToken(token);
  if (!claims) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const record = await getSubmittedForStaff(claims.questionnaireId);
  if (!record) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const owned = findFileAnswerInRecord(record, claims.fileId);
  if (!owned) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
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
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
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
      // Help Word's HTTP open path accept the resource as a document.
      "Accept-Ranges": "bytes",
    },
  });
}
