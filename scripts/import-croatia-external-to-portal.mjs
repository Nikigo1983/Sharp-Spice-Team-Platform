/**
 * Import Croatia External CRM clients into client-portal questionnaires (Supabase).
 *
 * Usage:
 *   node scripts/import-croatia-external-to-portal.mjs --dry-run
 *   node scripts/import-croatia-external-to-portal.mjs
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");

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

function parseCsvRows(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell.trim());
      if (row.some((c) => c)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (ch === "\r") continue;
    cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell.trim());
    if (row.some((c) => c)) rows.push(row);
  }
  return rows;
}

async function fetchExternalRows() {
  const spreadsheetId =
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ||
    "138W2nHQcJu_xRsI2RBqeD6Oq8Tg9FbKH";
  const gid =
    process.env.GOOGLE_SHEETS_PUBLIC_CLIENTS_GID?.trim() || "1431336126";
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sheets CSV HTTP ${res.status}`);
  return parseCsvRows(await res.text());
}

async function loadMapper() {
  const mod = await import(
    pathToFileURL(
      resolve("src/lib/client-portal/legacy-crm.ts"),
    ).href
  );
  return mod;
}

function rowsToClients(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0];
  const clients = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const sheetColumns = {};
    headers.forEach((h, idx) => {
      sheetColumns[h] = row[idx] ?? "";
    });
    const name = (row[0] || "").trim();
    const passport = (row[2] || "").trim();
    if (!name && !passport) continue;
    clients.push({
      name,
      citizenship: (row[1] || "").trim(),
      passportNumber: passport,
      email: (row[3] || "").trim(),
      submittedAt: (row[4] || "").trim(),
      expectedApprovalAt: (row[5] || "").trim(),
      referentName: (row[6] || "").trim(),
      bookingAddress: (row[7] || "").trim(),
      bookingRange: (row[8] || "").trim(),
      approvalAt: (row[9] || "").trim(),
      notes: (row[10] || "").trim(),
      residenceCardIssuedAt: (row[11] || "").trim(),
      appPassword: (row[12] || "").trim(),
      partnerName: (row[13] || "").trim(),
      contract: (row[14] || "").trim(),
      status: "В работе",
      direction: "Хорватия",
      country: "Хорватия",
      rowIndex: i + 1,
      sheetColumns,
    });
  }
  return clients;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  }

  const {
    buildLegacyAnswersFromClient,
    legacyCrmFingerprint,
    legacyQuestionnaireId,
    legacyUserId,
    parseSubmittedAtIso,
  } = await loadMapper();

  console.log(dryRun ? "Mode: DRY-RUN" : "Mode: WRITE");
  console.log("Fetching External sheet CSV…");
  const rawRows = await fetchExternalRows();
  const clients = rowsToClients(rawRows);
  console.log(`Rows with clients: ${clients.length} (sheet rows=${rawRows.length})`);

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const importedAt = new Date().toISOString();
  const deadPasswordHash = await bcrypt.hash(
    `legacy-disabled-${randomBytes(16).toString("hex")}`,
    10,
  );

  for (const client of clients) {
    const fingerprint = legacyCrmFingerprint(client);
    const userId = legacyUserId(fingerprint);
    const questionnaireId = legacyQuestionnaireId(fingerprint);
    const displayEmail =
      (client.email || "").trim() || `legacy.${fingerprint}@import.local`;
    const userEmail = `legacy.${fingerprint}@import.local`;
    const firstName =
      (client.name || "").trim().split(/\s+/)[0] || "Клиент";
    const submittedAt =
      parseSubmittedAtIso(client.submittedAt) || importedAt;

    const { data: existingQ } = await sb
      .from("client_portal_questionnaires")
      .select("id, answers, revision, created_at, staff_opened_at")
      .eq("id", questionnaireId)
      .maybeSingle();

    const answers = buildLegacyAnswersFromClient(client, {
      importedAt,
      existingAnswers: existingQ?.answers ?? {},
    });

    // Strip app password from stored sheet snapshot for safety
    if (answers.__legacySheet && typeof answers.__legacySheet === "object") {
      for (const key of Object.keys(answers.__legacySheet)) {
        if (key.toLowerCase().includes("пароль")) {
          answers.__legacySheet[key] = "";
        }
      }
    }

    if (dryRun) {
      if (existingQ) updated += 1;
      else created += 1;
      continue;
    }

    const now = new Date().toISOString();
    const { error: userError } = await sb.from("client_portal_users").upsert(
      {
        id: userId,
        email: userEmail,
        first_name: firstName,
        preferred_locale: "ru",
        invitation_id: null,
        password_hash: deadPasswordHash,
        created_at: existingQ?.created_at || now,
        updated_at: now,
      },
      { onConflict: "id" },
    );
    if (userError) {
      console.error("user upsert failed", fingerprint, userError.message);
      skipped += 1;
      continue;
    }

    const { error: qError } = await sb.from("client_portal_questionnaires").upsert(
      {
        id: questionnaireId,
        client_portal_user_id: userId,
        invitation_id: null,
        email: displayEmail,
        first_name: firstName,
        status: "submitted",
        answers,
        revision: (existingQ?.revision ?? 0) + 1,
        created_at: existingQ?.created_at || now,
        updated_at: now,
        submitted_at: submittedAt,
        // Avoid flooding "Новая" for historical imports
        staff_opened_at: existingQ?.staff_opened_at || importedAt,
      },
      { onConflict: "id" },
    );
    if (qError) {
      console.error("questionnaire upsert failed", fingerprint, qError.message);
      skipped += 1;
      continue;
    }

    if (existingQ) updated += 1;
    else created += 1;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        total: clients.length,
        created,
        updated,
        skipped,
        sampleFingerprints: clients.slice(0, 3).map((c) => ({
          name: c.name,
          fingerprint: legacyCrmFingerprint(c),
          id: legacyQuestionnaireId(legacyCrmFingerprint(c)),
        })),
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
