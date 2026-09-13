/**
 * Import Immigration_Knowledge_Base from Google Drive into platform KB (app_state).
 *
 *   node scripts/migrate-immigration-kb.mjs --dry-run
 *   node scripts/migrate-immigration-kb.mjs
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
const TARGET = "Immigration_Knowledge_Base";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const APP_STATE_KEY = "platform_knowledge_base_v1";
const LIBRARY_ID = "lib-client-knowledge";

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
  const data = await response.json();
  return data.access_token;
}

async function driveJson(path, token) {
  const res = await fetch(`${DRIVE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive HTTP ${res.status} ${path}`);
  return res.json();
}

async function driveText(path, token) {
  const res = await fetch(`${DRIVE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive HTTP ${res.status} ${path}`);
  return res.text();
}

async function driveBuffer(path, token) {
  const res = await fetch(`${DRIVE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive HTTP ${res.status} ${path}`);
  return Buffer.from(await res.arrayBuffer());
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

async function findTarget(rootId, token) {
  const override = process.env.GOOGLE_DRIVE_KB_MIGRATE_FOLDER_ID?.trim();
  if (override) return override;
  const root = await driveJson(
    `/files/${encodeURIComponent(rootId)}?fields=id,name&supportsAllDrives=true`,
    token,
  );
  if (root.name === TARGET) return root.id;
  const queue = [rootId];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const children = await listChildren(id, token);
    for (const child of children) {
      if (child.mimeType !== FOLDER_MIME) continue;
      if (child.name === TARGET) return child.id;
      queue.push(child.id);
    }
    if (seen.size > 2000) break;
  }
  return null;
}

async function extractText(file, token) {
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
  if (mime.startsWith("text/") || mime === "application/json") {
    const buf = await driveBuffer(
      `/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`,
      token,
    );
    return buf.toString("utf8").trim();
  }
  if (
    mime.includes("spreadsheetml") ||
    mime.includes("ms-excel") ||
    /\.(xlsx|xls)$/i.test(file.name || "")
  ) {
    if (Number(file.size || 0) > 12 * 1024 * 1024) {
      return `[Таблица слишком большая: ${file.name}]`;
    }
    const buf = await driveBuffer(
      `/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`,
      token,
    );
    const XLSX = require("xlsx");
    const workbook = XLSX.read(buf, { type: "buffer", cellDates: true });
    const parts = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
      if (!csv) continue;
      parts.push(
        workbook.SheetNames.length > 1 ? `## ${sheetName}\n${csv}` : csv,
      );
    }
    const text = parts.join("\n\n").trim();
    return text || `[Таблица пуста: ${file.name}]`;
  }
  if (mime.includes("pdf")) {
    if (Number(file.size || 0) > 8 * 1024 * 1024) {
      return `[PDF слишком большой: ${file.name}]`;
    }
    try {
      const buf = await driveBuffer(
        `/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`,
        token,
      );
      const { PDFParse } = require("pdf-parse");
      const parser = new PDFParse({ data: buf });
      const result = await parser.getText();
      await parser.destroy?.();
      return (result.text || "").trim();
    } catch {
      return `[Не удалось извлечь текст PDF: ${file.name}]`;
    }
  }
  return `[Файл импортирован без текста (${mime}): ${file.name}]`;
}

function mergeSnapshot(existing, folders, articles) {
  const now = new Date().toISOString();
  const snapshot = existing && typeof existing === "object"
    ? {
        library: existing.library || {
          id: LIBRARY_ID,
          slug: "client_knowledge",
          title: "База знаний для клиентов",
          updatedAt: now,
        },
        folders: Array.isArray(existing.folders) ? [...existing.folders] : [],
        articles: Array.isArray(existing.articles) ? [...existing.articles] : [],
      }
    : {
        library: {
          id: LIBRARY_ID,
          slug: "client_knowledge",
          title: "База знаний для клиентов",
          updatedAt: now,
        },
        folders: [],
        articles: [],
      };

  const folderIdByDrive = new Map();
  for (const folder of snapshot.folders) {
    if (folder.sourceDriveId) folderIdByDrive.set(folder.sourceDriveId, folder.id);
  }

  let foldersCreated = 0;
  let articlesCreated = 0;
  let updated = 0;

  const pending = [...folders];
  let safety = pending.length + 10;
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
    if (article.sourceDriveId) articleIndexByDrive.set(article.sourceDriveId, index);
  });

  for (const item of articles) {
    const folderId = item.parentSourceDriveId
      ? folderIdByDrive.get(item.parentSourceDriveId) || null
      : null;
    const existingIndex = articleIndexByDrive.get(item.sourceDriveId);
    if (existingIndex != null) {
      const cur = snapshot.articles[existingIndex];
      if (
        cur.title !== item.title ||
        cur.body !== item.body ||
        cur.folderId !== folderId
      ) {
        snapshot.articles[existingIndex] = {
          ...cur,
          title: item.title,
          body: item.body,
          folderId,
          sourceMimeType: item.sourceMimeType,
          updatedAt: now,
          updatedByName: "Drive import",
        };
        updated += 1;
      }
    } else {
      snapshot.articles.unshift({
        id: randomUUID(),
        libraryId: LIBRARY_ID,
        folderId,
        title: item.title,
        body: item.body,
        status: "published",
        sourceDriveId: item.sourceDriveId,
        sourceMimeType: item.sourceMimeType,
        updatedByUserId: null,
        updatedByName: "Drive import",
        createdAt: now,
        updatedAt: now,
      });
      articlesCreated += 1;
    }
  }

  snapshot.library = {
    ...snapshot.library,
    id: LIBRARY_ID,
    slug: "client_knowledge",
    title: "База знаний для клиентов",
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
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  }

  console.log(dryRun ? "Mode: DRY-RUN" : "Mode: WRITE to Supabase app_state");
  const token = await getToken();
  const targetId = await findTarget(rootId, token);
  if (!targetId) throw new Error(`Folder ${TARGET} not found`);
  console.log("Target folder:", targetId);

  const folders = [
    {
      sourceDriveId: targetId,
      parentSourceDriveId: null,
      name: TARGET,
    },
  ];
  const articles = [];

  const queue = [targetId];
  const seen = new Set();
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
      process.stdout.write(`  extract: ${child.name}\n`);
      const body = dryRun ? "" : await extractText(child, token);
      articles.push({
        sourceDriveId: child.id,
        parentSourceDriveId: currentId,
        title: child.name,
        body,
        sourceMimeType: child.mimeType,
      });
    }
  }

  console.log(`Collected folders=${folders.length} articles=${articles.length}`);

  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, folders: folders.length, articles: articles.length }, null, 2));
    return;
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
  if (error) throw new Error(error.message);

  console.log(
    JSON.stringify(
      {
        dryRun: false,
        foldersCreated,
        articlesCreated,
        updated,
        totalFolders: snapshot.folders.length,
        totalArticles: snapshot.articles.length,
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
