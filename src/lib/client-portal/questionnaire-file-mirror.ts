import { readFormgridStoredFiles } from "@/lib/client-portal/formgrid-import";
import {
  isFileAnswer,
  type QuestionnaireAnswers,
} from "@/lib/client-portal/questionnaire-types";
import {
  appendStaffDocument,
  readStaffDocuments,
} from "@/lib/client-portal/staff-case-meta";
import {
  QUESTIONNAIRE_FILE_UPLOADER_ID,
  QUESTIONNAIRE_FILE_UPLOADER_NAME,
} from "@/lib/client-portal/questionnaire-word-export";

/**
 * Copy client questionnaire file answers (and Formgrid-stored files) into
 * `__staff_documents` (same file ids, storage stays under the portal user).
 * Idempotent by attachment id.
 */
export function mirrorQuestionnaireFilesIntoStaffDocuments(
  answers: QuestionnaireAnswers,
  createdAt: string = new Date().toISOString(),
): { answers: QuestionnaireAnswers; added: number } {
  let next = answers;
  let added = 0;
  const existingIds = new Set(
    readStaffDocuments(next).map((doc) => doc.id),
  );

  for (const value of Object.values(answers)) {
    if (!isFileAnswer(value) || existingIds.has(value.id)) continue;
    next = appendStaffDocument(next, {
      id: value.id,
      fileName: value.fileName,
      mimeType: value.mimeType,
      sizeBytes: value.sizeBytes,
      uploadedByName: QUESTIONNAIRE_FILE_UPLOADER_NAME,
      uploadedByUserId: QUESTIONNAIRE_FILE_UPLOADER_ID,
      createdAt,
    });
    existingIds.add(value.id);
    added += 1;
  }

  for (const stored of Object.values(readFormgridStoredFiles(answers))) {
    if (!stored.id || existingIds.has(stored.id)) continue;
    next = appendStaffDocument(next, {
      id: stored.id,
      fileName: stored.fileName,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      uploadedByName: QUESTIONNAIRE_FILE_UPLOADER_NAME,
      uploadedByUserId: QUESTIONNAIRE_FILE_UPLOADER_ID,
      createdAt: stored.storedAt || createdAt,
    });
    existingIds.add(stored.id);
    added += 1;
  }

  return { answers: next, added };
}
