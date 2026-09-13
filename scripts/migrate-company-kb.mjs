/**
 * Import Демо документы / СПИОРА / ЭМИГРАНТ into company KB + Supabase Storage.
 *
 *   node scripts/migrate-company-kb.mjs --dry-run
 *   node scripts/migrate-company-kb.mjs
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const { SignJWT, importPKCS8 } = require("jose");

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
const ROOT_NAMES = ["Демо документы", "СПИОРА", "ЭМИГРАНТ"];
const FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const APP_STATE_KEY = "platform_company_knowledge_base_v1";
const LIBRARY_ID = "lib-company-knowledge";
const LIBRARY_SLUG = "company_knowledge";
const BUCKET = "knowledge-base";
const MAX_BYTES = 40 * 1024 * 1024;

function norm(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function matchName(a, b) {
  const x = norm(a);
  const y = norm(b);
  return x === y || x.includes(y) || y.includes(x);
}

async function getToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  let key = process.env.GOOGLE_PRIVATE_KEY?.trim() || "";
  key = key.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google SA env missing");
  const privateKey = await importPKCS8(key, "RS256");
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/drive.readonly",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email)
    .setSubject(email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Token HTTP ${response.status}`);
  return (await response.json()).access_token;
}

async function driveJson(path, token) {
  const res = await fetch(`${DRIVE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive HTTP ${res.status}`);
  return res.json();
}

async function driveBuffer(path, token) {
  const res = await fetch(`${DRIVE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function driveText(path, token) {
  const res = await fetch(`${DRIVE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive HTTP ${res.status}`);
  return res.text();
}

async function listChildren(folderId, token) {
  const files = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,size)",
      pageSize: "200",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await driveJson(`/files?${params}`, token);
    files.push(...(data.files || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return files;
}

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || "");
  return (m?.[1] || "bin").toLowerCase();
}

function storagePath(driveId, fileName) {
  return `${LIBRARY_SLUG}/drive-${driveId}.${extOf(fileName)}`;
}

function shouldStoreBinary(mime, name) {
  if (String(mime).startsWith("application/vnd.google-apps.")) return false;
  if (String(mime).startsWith("image/")) return true;
  if (String(mime).includes("pdf")) return true;
  if (/\.(docx?|pptx?|xlsx?|png|jpe?g|gif|webp|zip)$/i.test(name || ""))
    return true;
  if (!String(mime).startsWith("text/")) return true;
  return false;
}

async function extractText(file, buffer, token) {
  const mime = file.mimeType || "";
  if (
    mime === "application/vnd.google-apps.document" ||
    mime === "application/vnd.google-apps.presentation"
  ) {
    return (
      await driveText(
        `/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent("text/plain")}`,
        token,
      )
    ).trim();
  }
  if (mime === "application/vnd.google-apps.spreadsheet") {
    return (
      await driveText(
        `/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent("text/csv")}`,
        token,
      )
    ).trim();
  }
  if (!buffer) return "";
  if (mime.includes("pdf")) {
    try {
      const { PDFParse } = require("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy?.();
      return (result.text || "").trim();
    } catch {
      return "";
    }
  }
  if (mime.startsWith("text/") || mime === "application/json") {
    return buffer.toString("utf8").trim();
  }
  if (
    mime.includes("spreadsheetml") ||
    mime.includes("ms-excel") ||
    /\.(xlsx|xls)$/i.test(file.name || "")
  ) {
    try {
      const XLSX = require("xlsx");
      const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
      const parts = [];
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const csv = XLSX.utils
          .sheet_to_csv(sheet, { blankrows: false })
          .trim();
        if (csv) {
          parts.push(wb.SheetNames.length > 1 ? `## ${sheetName}\n${csv}` : csv);
        }
      }
      return parts.join("\n\n").trim();
    } catch {
      return "";
    }
  }
  return "";
}

async function ensureBucket(sb) {
  const { data } = await sb.storage.listBuckets();
  if (data?.some((b) => b.id === BUCKET || b.name === BUCKET)) return;
  const { error } = await sb.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_BYTES,
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`createBucket: ${error.message}`);
  }
}

function mergeSnapshot(existing, folders, articles) {
  const now = new Date().toISOString();
  const snapshot =
    existing && typeof existing === "object"
      ? {
          library: existing.library || {
            id: LIBRARY_ID,
            slug: LIBRARY_SLUG,
            title: "База знаний для компании",
            updatedAt: now,
          },
          folders: Array.isArray(existing.folders) ? [...existing.folders] : [],
          articles: Array.isArray(existing.articles)
            ? [...existing.articles]
            : [],
        }
      : {
          library: {
            id: LIBRARY_ID,
            slug: LIBRARY_SLUG,
            title: "База знаний для компании",
            updatedAt: now,
          },
          folders: [],
          articles: [],
        };

  const folderIdByDrive = new Map();
  for (const f of snapshot.folders) {
    if (f.sourceDriveId) folderIdByDrive.set(f.sourceDriveId, f.id);
  }

  let foldersCreated = 0;
  let articlesCreated = 0;
  let updated = 0;

  const pending = [...folders];
  let safety = pending.length + 20;
  while (pending.length && safety-- > 0) {
    const next = [];
    for (const item of pending) {
      const parentOk =
        item.parentSourceDriveId == null ||
        folderIdByDrive.has(item.parentSourceDriveId);
      if (!parentOk) {
        next.push(item);
        continue;
      }
      const parentId = item.parentSourceDriveId
        ? folderIdByDrive.get(item.parentSourceDriveId)
        : null;
      const existingId = folderIdByDrive.get(item.sourceDriveId);
      if (existingId) {
        const idx = snapshot.folders.findIndex((f) => f.id === existingId);
        if (idx >= 0) {
          const cur = snapshot.folders[idx];
          if (cur.name !== item.name || cur.parentId !== parentId) {
            snapshot.folders[idx] = {
              ...cur,
              name: item.name,
              parentId,
              updatedAt: now,
            };
            updated += 1;
          }
        }
      } else {
        const id = randomUUID();
        folderIdByDrive.set(item.sourceDriveId, id);
        snapshot.folders.push({
          id,
          libraryId: LIBRARY_ID,
          parentId,
          name: item.name,
          sortOrder: snapshot.folders.filter((f) => f.parentId === parentId)
            .length,
          sourceDriveId: item.sourceDriveId,
          createdAt: now,
          updatedAt: now,
        });
        foldersCreated += 1;
      }
    }
    if (next.length === pending.length) break;
    pending.splice(0, pending.length, ...next);
  }

  const articleIndexByDrive = new Map();
  snapshot.articles.forEach((article, index) => {
    if (article.sourceDriveId)
      articleIndexByDrive.set(article.sourceDriveId, index);
  });

  for (const item of articles) {
    const folderId = item.parentSourceDriveId
      ? folderIdByDrive.get(item.parentSourceDriveId) || null
      : null;
    const existingIndex = articleIndexByDrive.get(item.sourceDriveId);
    if (existingIndex != null) {
      const cur = snapshot.articles[existingIndex];
      snapshot.articles[existingIndex] = {
        ...cur,
        title: item.title,
        body: item.body,
        folderId,
        kind: item.kind || "text",
        storagePath: item.storagePath ?? cur.storagePath ?? null,
        fileName: item.fileName ?? cur.fileName ?? null,
        sizeBytes: item.sizeBytes ?? cur.sizeBytes ?? null,
        sourceMimeType: item.sourceMimeType,
        updatedAt: now,
        updatedByName: "Company Drive import",
      };
      updated += 1;
    } else {
      snapshot.articles.unshift({
        id: randomUUID(),
        libraryId: LIBRARY_ID,
        folderId,
        title: item.title,
        body: item.body,
        status: "published",
        kind: item.kind || "text",
        storagePath: item.storagePath || null,
        fileName: item.fileName || null,
        sizeBytes: item.sizeBytes ?? null,
        sourceDriveId: item.sourceDriveId,
        sourceMimeType: item.sourceMimeType,
        updatedByUserId: null,
        updatedByName: "Company Drive import",
        createdAt: now,
        updatedAt: now,
      });
      articlesCreated += 1;
    }
  }

  snapshot.library = {
    id: LIBRARY_ID,
    slug: LIBRARY_SLUG,
    title: "База знаний для компании",
    updatedAt: now,
  };

  return { snapshot, foldersCreated, articlesCreated, updated };
}

async function main() {
  const rootId = process.env.GOOGLE_DRIVE_KB_FOLDER_ID?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!rootId) throw new Error("GOOGLE_DRIVE_KB_FOLDER_ID missing");
  if (!dryRun && (!url || !key)) {
    throw new Error("Supabase env missing");
  }

  console.log(dryRun ? "Mode: DRY-RUN" : "Mode: WRITE");
  const token = await getToken();
  const rootChildren = await listChildren(rootId, token);
  const roots = [];
  const missing = [];
  for (const wanted of ROOT_NAMES) {
    const hit = rootChildren.find(
      (c) => c.mimeType === FOLDER_MIME && matchName(c.name, wanted),
    );
    if (hit) roots.push(hit);
    else missing.push(wanted);
  }
  if (!roots.length) throw new Error("No target folders found");
  console.log(
    "Roots:",
    roots.map((r) => r.name).join(", "),
    missing.length ? `| missing: ${missing.join(", ")}` : "",
  );

  const folders = [];
  const articles = [];
  let filesStored = 0;
  let skippedLarge = 0;
  let foldersCreatedTotal = 0;
  let articlesCreatedTotal = 0;
  let updatedTotal = 0;

  const sb =
    !dryRun && url && key
      ? createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  if (sb) await ensureBucket(sb);

  async function checkpoint(label) {
    if (dryRun || !sb) return;
    const { data: existingRow } = await sb
      .from("app_state")
      .select("value")
      .eq("key", APP_STATE_KEY)
      .maybeSingle();
    const { snapshot, foldersCreated, articlesCreated, updated } = mergeSnapshot(
      existingRow?.value,
      folders,
      articles,
    );
    const { error } = await sb.from("app_state").upsert(
      {
        key: APP_STATE_KEY,
        value: snapshot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(`checkpoint ${label}: ${error.message}`);
    foldersCreatedTotal += foldersCreated;
    articlesCreatedTotal += articlesCreated;
    updatedTotal += updated;
    console.log(
      `Checkpoint [${label}]: folders=${snapshot.folders.length} articles=${snapshot.articles.length} filesStored=${filesStored}`,
    );
  }

  for (const root of roots) {
    folders.push({
      sourceDriveId: root.id,
      parentSourceDriveId: null,
      name: root.name,
    });
    const queue = [root.id];
    const seen = new Set();
    let filesInRoot = 0;
    while (queue.length) {
      const currentId = queue.shift();
      if (seen.has(currentId)) continue;
      seen.add(currentId);
      const children = await listChildren(currentId, token);
      for (const child of children) {
        if (child.mimeType === FOLDER_MIME) {
          folders.push({
            sourceDriveId: child.id,
            parentSourceDriveId: currentId,
            name: child.name,
          });
          queue.push(child.id);
          continue;
        }

        const size = Number(child.size || 0);
        if (size > MAX_BYTES) {
          skippedLarge += 1;
          articles.push({
            sourceDriveId: child.id,
            parentSourceDriveId: currentId,
            title: child.name,
            body: `[Файл слишком большой: ${child.name}]`,
            sourceMimeType: child.mimeType,
            kind: "text",
            fileName: child.name,
            sizeBytes: size,
          });
          continue;
        }

        process.stdout.write(`  file: ${child.name}\n`);
        if (dryRun) {
          articles.push({
            sourceDriveId: child.id,
            parentSourceDriveId: currentId,
            title: child.name,
            body: "",
            sourceMimeType: child.mimeType,
            kind: shouldStoreBinary(child.mimeType, child.name)
              ? "file"
              : "text",
            fileName: child.name,
            sizeBytes: size || null,
          });
          continue;
        }

        let body = "";
        let buffer = null;
        let storagePath = null;
        let kind = "text";
        let sizeBytes = size || null;

        if (String(child.mimeType).startsWith("application/vnd.google-apps.")) {
          body = (await extractText(child, null, token)).slice(0, 20000);
        } else {
          buffer = await driveBuffer(
            `/files/${encodeURIComponent(child.id)}?alt=media&supportsAllDrives=true`,
            token,
          );
          sizeBytes = buffer.byteLength;
          if (shouldStoreBinary(child.mimeType, child.name)) {
            storagePath = `${LIBRARY_SLUG}/drive-${child.id}.${extOf(child.name)}`;
            const { error } = await sb.storage
              .from(BUCKET)
              .upload(storagePath, buffer, {
                contentType: child.mimeType || "application/octet-stream",
                upsert: true,
              });
            if (error) throw new Error(`upload ${child.name}: ${error.message}`);
            kind = "file";
            filesStored += 1;
            const extracted = await extractText(child, buffer, token);
            body = extracted ? extracted.slice(0, 4000) : "";
          } else {
            body = (await extractText(child, buffer, token)).slice(0, 20000);
          }
        }

        articles.push({
          sourceDriveId: child.id,
          parentSourceDriveId: currentId,
          title: child.name,
          body,
          sourceMimeType: child.mimeType,
          kind,
          storagePath,
          fileName: child.name,
          sizeBytes,
        });
        filesInRoot += 1;
        if (filesInRoot % 40 === 0) {
          await checkpoint(`${root.name} @${filesInRoot}`);
        }
      }
    }
    await checkpoint(root.name);
  }

  console.log(
    `Collected folders=${folders.length} articles=${articles.length} filesStored=${filesStored}`,
  );

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          folders: folders.length,
          articles: articles.length,
          missing,
          skippedLarge,
        },
        null,
        2,
      ),
    );
    return;
  }

  await checkpoint("final");

  console.log(
    JSON.stringify(
      {
        dryRun: false,
        foldersCreated: foldersCreatedTotal,
        articlesCreated: articlesCreatedTotal,
        updated: updatedTotal,
        filesStored,
        skippedLarge,
        missing,
        totalFolders: folders.length,
        totalArticles: articles.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
