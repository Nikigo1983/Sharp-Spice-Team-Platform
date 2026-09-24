/**
 * Download Formgrid document URLs into Supabase Storage and attach them
 * to imported portal questionnaires.
 *
 * Usage:
 *   node --experimental-strip-types scripts/migrate-formgrid-files-to-storage.mjs --dry-run
 *   node --experimental-strip-types scripts/migrate-formgrid-files-to-storage.mjs
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(process.env[k] || "").trim()) process.env[k] = v;
  }
}

loadEnvLocal();

const dryRun = process.argv.includes("--dry-run");
const nameArg = process.argv.find((a) => a.startsWith("--name="));
const nameFilter = nameArg
  ? nameArg
      .slice("--name=".length)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
  : "";
const BUCKET = "task-attachments";
const OBJECT_PREFIX = "client-portal";
const MAX_BYTES = 25 * 1024 * 1024;

function safeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "user";
}

function extFromFileName(fileName) {
  const base = String(fileName).trim().split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

function contentTypeFromExt(ext) {
  const map = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext] || "application/octet-stream";
}

function guessExtFromContentType(contentType) {
  const mime = String(contentType || "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime.includes("wordprocessingml")) return "docx";
  if (mime === "application/msword") return "doc";
  return "";
}

async function loadMapper() {
  return import(
    pathToFileURL(resolve("src/lib/client-portal/formgrid-import.ts")).href
  );
}

async function downloadFile(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      Accept: "*/*",
      "User-Agent": "SharpSpice-FormgridMigrate/1.0",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error("empty body");
  if (buf.length > MAX_BYTES) throw new Error(`too large (${buf.length} bytes)`);
  return { buf, contentType };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  }

  const mapper = await loadMapper();
  console.log(dryRun ? "Mode: DRY-RUN" : "Mode: WRITE");

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const pageSize = 200;
  let from = 0;
  let questionnaires = [];
  for (;;) {
    const { data, error } = await sb
      .from("client_portal_questionnaires")
      .select("id, client_portal_user_id, answers, revision, email, first_name")
      .eq("status", "submitted")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    questionnaires = questionnaires.concat(batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  const formgridQs = questionnaires.filter((q) => {
    if (!mapper.isFormgridImport(q.answers || {})) return false;
    if (!nameFilter) return true;
    const answers =
      q.answers && typeof q.answers === "object" ? q.answers : {};
    const fullName = String(
      answers.full_name_cyrillic ||
        answers.full_name_latin ||
        q.first_name ||
        "",
    )
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    return fullName.includes(nameFilter);
  });
  console.log(
    `Questionnaires: ${questionnaires.length}, formgrid: ${formgridQs.length}${
      nameFilter ? ` (name filter: ${nameFilter})` : ""
    }`,
  );

  let scannedUrls = 0;
  let skippedDone = 0;
  let uploaded = 0;
  let failed = 0;
  let updatedCases = 0;

  for (const q of formgridQs) {
    const answers = { ...(q.answers || {}) };
    const entries = mapper.listFormgridExternalFileEntries(answers);
    if (!entries.length) continue;

    const stored = mapper.readFormgridStoredFiles(answers);
    let changed = false;
    const ownerKey = q.client_portal_user_id;

    for (const entry of entries) {
      scannedUrls += 1;
      const existing = stored[entry.column];
      if (existing?.id && existing.sourceUrl === entry.url) {
        skippedDone += 1;
        continue;
      }

      const displayName = mapper.fileNameFromExternalUrl(
        entry.url,
        entry.column,
      );

      if (dryRun) {
        console.log(
          `[dry-run] ${q.first_name || q.email} · ${entry.column} → ${displayName}`,
        );
        uploaded += 1;
        changed = true;
        continue;
      }

      try {
        const { buf, contentType } = await downloadFile(entry.url);
        let fileName = displayName;
        let ext = extFromFileName(fileName) || guessExtFromContentType(contentType);
        if (!extFromFileName(fileName) && ext) {
          fileName = `${fileName}.${ext}`;
        }
        if (!ext) ext = "bin";

        const attachmentId = randomUUID();
        const objectName = `${OBJECT_PREFIX}/${safeSegment(ownerKey)}/${attachmentId}.${ext}`;
        const mime = contentTypeFromExt(ext) || contentType.split(";")[0].trim();

        const { error: upErr } = await sb.storage.from(BUCKET).upload(objectName, buf, {
          contentType: mime,
          upsert: true,
        });
        if (upErr) throw upErr;

        const fileMeta = {
          id: attachmentId,
          fileName: fileName.slice(0, 255),
          mimeType: mime,
          sizeBytes: buf.length,
          sourceUrl: entry.url,
          sheetColumn: entry.column,
          storedAt: new Date().toISOString(),
        };
        stored[entry.column] = fileMeta;

        const portalField = mapper.guessPortalFileQuestionId(entry.column);
        if (portalField) {
          answers[portalField] = {
            id: fileMeta.id,
            fileName: fileMeta.fileName,
            mimeType: fileMeta.mimeType,
            sizeBytes: fileMeta.sizeBytes,
          };
        }

        uploaded += 1;
        changed = true;
        console.log(
          `stored ${q.first_name || q.email} · ${entry.column} (${buf.length} bytes)`,
        );
      } catch (err) {
        failed += 1;
        console.error(
          `FAIL ${q.id} · ${entry.column}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    if (!changed) continue;

    if (!dryRun) {
      answers[mapper.FORMGRID_FILES_KEY] = stored;
      const docsKey = "__staff_documents";
      const existingDocs = Array.isArray(answers[docsKey])
        ? [...answers[docsKey]]
        : [];
      const existingIds = new Set(
        existingDocs.map((d) => d?.id).filter(Boolean),
      );
      for (const fileMeta of Object.values(stored)) {
        if (!fileMeta?.id || existingIds.has(fileMeta.id)) continue;
        existingDocs.push({
          id: fileMeta.id,
          fileName: fileMeta.fileName,
          mimeType: fileMeta.mimeType,
          sizeBytes: fileMeta.sizeBytes,
          uploadedByName: "Из анкеты",
          uploadedByUserId: "system-questionnaire-file",
          createdAt: fileMeta.storedAt || new Date().toISOString(),
        });
        existingIds.add(fileMeta.id);
      }
      answers[docsKey] = existingDocs;
      const { error: updErr } = await sb
        .from("client_portal_questionnaires")
        .update({
          answers,
          revision: (q.revision ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", q.id);
      if (updErr) {
        console.error(`update failed ${q.id}`, updErr.message);
        failed += 1;
        continue;
      }
    }
    updatedCases += 1;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        formgridCases: formgridQs.length,
        scannedUrls,
        skippedDone,
        uploaded,
        failed,
        updatedCases,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
