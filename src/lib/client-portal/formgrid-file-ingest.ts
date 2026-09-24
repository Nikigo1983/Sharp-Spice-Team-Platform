import "server-only";

import { randomUUID } from "node:crypto";
import {
  FORMGRID_FILES_KEY,
  fileNameFromExternalUrl,
  guessPortalFileQuestionId,
  isFormgridImport,
  listFormgridExternalFileEntries,
  readFormgridStoredFiles,
  type FormgridStoredFile,
} from "@/lib/client-portal/formgrid-import";
import {
  contentTypeFromExt,
  extFromFileName,
} from "@/lib/client-portal/questionnaire-attachment-formats";
import { saveQuestionnaireAttachmentFile } from "@/lib/client-portal/questionnaire-attachment-storage";
import { mirrorQuestionnaireFilesIntoStaffDocuments } from "@/lib/client-portal/questionnaire-file-mirror";
import type { QuestionnaireRecord } from "@/lib/client-portal/questionnaire-types";
import { upsertQuestionnaire } from "@/lib/client-portal/questionnaire-store";

const MAX_BYTES = 25 * 1024 * 1024;

function guessExtFromContentType(contentType: string): string {
  const mime = contentType.toLowerCase().split(";")[0]?.trim() || "";
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime.includes("wordprocessingml")) return "docx";
  if (mime === "application/msword") return "doc";
  return "";
}

async function downloadExternalFile(url: string): Promise<{
  buf: Buffer;
  contentType: string;
}> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      Accept: "*/*",
      "User-Agent": "SharpSpice-FormgridIngest/1.0",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const contentType =
    res.headers.get("content-type") || "application/octet-stream";
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error("empty body");
  if (buf.length > MAX_BYTES) {
    throw new Error(`too large (${buf.length} bytes)`);
  }
  return { buf, contentType };
}

export type IngestFormgridFilesResult = {
  record: QuestionnaireRecord;
  downloaded: number;
  mirrored: number;
  failed: number;
};

/**
 * Download Formgrid sheet file URLs into portal storage, attach as questionnaire
 * file fields / `__formgridFiles`, and mirror into «Документы по клиенту».
 * Idempotent when the same source URL is already stored.
 */
export async function ingestFormgridExternalFiles(
  record: QuestionnaireRecord,
): Promise<IngestFormgridFilesResult> {
  if (!isFormgridImport(record.answers)) {
    return { record, downloaded: 0, mirrored: 0, failed: 0 };
  }

  const entries = listFormgridExternalFileEntries(record.answers);
  if (!entries.length) {
    const mirroredOnly = mirrorQuestionnaireFilesIntoStaffDocuments(
      record.answers,
      record.submittedAt ?? record.updatedAt,
    );
    if (mirroredOnly.added === 0) {
      return { record, downloaded: 0, mirrored: 0, failed: 0 };
    }
    const now = new Date().toISOString();
    const updated = await upsertQuestionnaire({
      ...record,
      answers: mirroredOnly.answers,
      updatedAt: now,
      revision: record.revision + 1,
    });
    return {
      record: updated,
      downloaded: 0,
      mirrored: mirroredOnly.added,
      failed: 0,
    };
  }

  let answers: Record<string, unknown> = { ...record.answers };
  const stored: Record<string, FormgridStoredFile> = {
    ...readFormgridStoredFiles(answers),
  };
  let downloaded = 0;
  let failed = 0;
  let changed = false;
  const ownerKey = record.clientPortalUserId;

  for (const entry of entries) {
    const existing = stored[entry.column];
    if (existing?.id && existing.sourceUrl === entry.url) {
      continue;
    }

    const displayName = fileNameFromExternalUrl(entry.url, entry.column);
    try {
      const { buf, contentType } = await downloadExternalFile(entry.url);
      let fileName = displayName;
      let ext =
        extFromFileName(fileName) || guessExtFromContentType(contentType);
      if (!extFromFileName(fileName) && ext) {
        fileName = `${fileName}.${ext}`;
      }
      if (!ext) ext = "bin";

      const attachmentId = randomUUID();
      const mime =
        contentTypeFromExt(ext) ||
        contentType.split(";")[0]?.trim() ||
        "application/octet-stream";

      await saveQuestionnaireAttachmentFile(
        ownerKey,
        attachmentId,
        fileName.slice(0, 255),
        buf,
        mime,
      );

      const fileMeta: FormgridStoredFile = {
        id: attachmentId,
        fileName: fileName.slice(0, 255),
        mimeType: mime,
        sizeBytes: buf.length,
        sourceUrl: entry.url,
        sheetColumn: entry.column,
        storedAt: new Date().toISOString(),
      };
      stored[entry.column] = fileMeta;

      const portalField = guessPortalFileQuestionId(entry.column);
      if (portalField) {
        answers[portalField] = {
          id: fileMeta.id,
          fileName: fileMeta.fileName,
          mimeType: fileMeta.mimeType,
          sizeBytes: fileMeta.sizeBytes,
        };
      }

      downloaded += 1;
      changed = true;
    } catch (error) {
      failed += 1;
      console.error("[formgrid-file-ingest] download failed", {
        questionnaireId: record.id,
        column: entry.column,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  if (changed) {
    answers[FORMGRID_FILES_KEY] = stored;
  }

  const mirrored = mirrorQuestionnaireFilesIntoStaffDocuments(
    answers,
    record.submittedAt ?? record.updatedAt,
  );
  if (!changed && mirrored.added === 0) {
    return { record, downloaded: 0, mirrored: 0, failed };
  }

  const now = new Date().toISOString();
  const updated = await upsertQuestionnaire({
    ...record,
    answers: mirrored.answers,
    updatedAt: now,
    revision: record.revision + 1,
  });

  return {
    record: updated,
    downloaded,
    mirrored: mirrored.added,
    failed,
  };
}
