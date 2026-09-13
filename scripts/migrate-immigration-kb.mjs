/**
 * Dry-run: locate Immigration_Knowledge_Base under GOOGLE_DRIVE_KB_FOLDER_ID.
 * Full import after deploy: Knowledge Base → «Импорт из Drive».
 *
 *   node scripts/migrate-immigration-kb.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
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

const TARGET = "Immigration_Knowledge_Base";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_API = "https://www.googleapis.com/drive/v3";

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
  if (!res.ok) throw new Error(`Drive HTTP ${res.status}`);
  return res.json();
}

async function listChildren(folderId, token) {
  const files = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType)",
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

async function countTree(folderId, token) {
  let folders = 0;
  let files = 0;
  const queue = [folderId];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const children = await listChildren(id, token);
    for (const child of children) {
      if (child.mimeType === FOLDER_MIME) {
        folders += 1;
        queue.push(child.id);
      } else {
        files += 1;
      }
    }
  }
  return { folders, files };
}

async function main() {
  const rootId = process.env.GOOGLE_DRIVE_KB_FOLDER_ID?.trim();
  if (!rootId) throw new Error("GOOGLE_DRIVE_KB_FOLDER_ID missing");
  const token = await getToken();
  const targetId = await findTarget(rootId, token);
  if (!targetId) {
    console.log(JSON.stringify({ found: false, target: TARGET }, null, 2));
    process.exit(1);
  }
  const counts = await countTree(targetId, token);
  console.log(
    JSON.stringify(
      {
        found: true,
        target: TARGET,
        targetFolderId: targetId,
        ...counts,
        note: "Full import: Knowledge Base → «Импорт из Drive» after deploy",
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
