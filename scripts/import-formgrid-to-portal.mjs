/**
 * Import Formgrid «Новые клиенты из анкеты» into Emigrant portal intake (Supabase).
 *
 * Usage:
 *   node --experimental-strip-types scripts/import-formgrid-to-portal.mjs --dry-run
 *   node --experimental-strip-types scripts/import-formgrid-to-portal.mjs --create-only
 *   node --experimental-strip-types scripts/import-formgrid-to-portal.mjs --create-only --dry-run
 *
 * Flags:
 *   --dry-run       count only, no writes
 *   --create-only   skip questionnaires that already exist (no updates)
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
const createOnly = process.argv.includes("--create-only");

/** Exact FIO match after normalize (case/space insensitive). */
const EXCLUDED_FULL_NAMES = ["белоусова вероника николаевна"];

const DEFAULT_FORMGRID_SPREADSHEET_ID = "1S8Y0VCaAQ78wxg5Rxl8fcFMkwSsvr-X-cLrAlK4nF9Q";
const DEFAULT_FORMGRID_GID = "0";
const LEAD_REVIEW_APP_STATE_KEY = "formgrid_lead_reviews";
const DISMISSED_STATUSES = new Set(["rejected", "duplicate"]);

function normalizePersonName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isExcludedName(fullName) {
  const n = normalizePersonName(fullName);
  if (!n) return false;
  return EXCLUDED_FULL_NAMES.some(
    (ex) => n === ex || n.startsWith(`${ex} `) || n.includes(ex),
  );
}

function buildFormgridRowKey(headers, row) {
  const nameIdx = headers.findIndex((header) => /имя|name|фио/i.test(header));
  const emailIdx = headers.findIndex((header) =>
    /email|почта|e-mail/i.test(header),
  );
  const phoneIdx = headers.findIndex((header) => /тел|phone/i.test(header));
  const parts = [
    nameIdx >= 0 ? row[nameIdx] : "",
    emailIdx >= 0 ? row[emailIdx] : "",
    phoneIdx >= 0 ? row[phoneIdx] : "",
    row.join("|"),
  ];
  return parts.join("::");
}

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

async function fetchFormgridRows() {
  const spreadsheetId =
    process.env.GOOGLE_SHEETS_FORMGRID_SPREADSHEET_ID?.trim() ||
    DEFAULT_FORMGRID_SPREADSHEET_ID;
  const gid = process.env.GOOGLE_SHEETS_FORMGRID_GID?.trim() || DEFAULT_FORMGRID_GID;
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Formgrid CSV HTTP ${res.status}`);
  return parseCsvRows(await res.text());
}

async function loadMapper() {
  return import(
    pathToFileURL(resolve("src/lib/client-portal/formgrid-import.ts")).href
  );
}

async function loadDismissedRowKeys(sb) {
  const { data, error } = await sb
    .from("app_state")
    .select("value")
    .eq("key", LEAD_REVIEW_APP_STATE_KEY)
    .maybeSingle();
  if (error) {
    console.warn("could not load lead-review dismiss store:", error.message);
    return new Set();
  }
  const reviews = data?.value?.reviews;
  if (!reviews || typeof reviews !== "object") return new Set();
  const keys = new Set();
  for (const review of Object.values(reviews)) {
    if (review && DISMISSED_STATUSES.has(review.status) && review.rowKey) {
      keys.add(review.rowKey);
    }
  }
  return keys;
}

function rowsToLeads(rows, mapper, dismissedKeys) {
  if (rows.length < 2) return [];
  const headers = rows[0];
  const leads = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const sheetRow = i + 1;
    const rowKey = buildFormgridRowKey(headers, row);
    if (dismissedKeys.has(rowKey)) continue;

    const sheetColumns = {};
    headers.forEach((h, idx) => {
      sheetColumns[String(h || `col_${idx}`)] = row[idx] ?? "";
    });
    const fields = mapper.extractFormgridClientFields(sheetColumns);
    if (!fields.fullName && !fields.email && !fields.passport && !fields.phone) {
      continue;
    }
    const leadId = `sheet-${sheetRow}`;
    const fingerprint = mapper.formgridFingerprint(sheetColumns, leadId);
    leads.push({
      leadId,
      sheetRow,
      sheetColumns,
      fields,
      fingerprint,
      rowKey,
    });
  }
  return leads;
}

function normalizePassport(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function loadExistingIndexes(sb) {
  const passports = new Map();
  const emails = new Map();
  const formgridIds = new Set();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("client_portal_questionnaires")
      .select("id, email, answers")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    for (const row of batch) {
      if (String(row.id || "").startsWith("formgrid-q-")) {
        formgridIds.add(row.id);
      }
      const answers =
        row.answers && typeof row.answers === "object" ? row.answers : {};
      const passport = normalizePassport(answers.passport_number);
      if (passport) passports.set(passport, row.id);
      const email =
        normalizeEmail(answers.contact_email) || normalizeEmail(row.email);
      if (email && email.includes("@") && !email.endsWith("@import.local")) {
        emails.set(email, row.id);
      }
    }
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return { passports, emails, formgridIds };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  }

  const mapper = await loadMapper();
  console.log(dryRun ? "Mode: DRY-RUN" : "Mode: WRITE");
  console.log(createOnly ? "Create-only: yes" : "Create-only: no (upsert)");
  console.log("Fetching Formgrid sheet CSV…");

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const dismissedKeys = await loadDismissedRowKeys(sb);
  console.log(`Dismissed/rejected Formgrid rows: ${dismissedKeys.size}`);

  const rawRows = await fetchFormgridRows();
  const leads = rowsToLeads(rawRows, mapper, dismissedKeys);
  console.log(
    `Active leads with data: ${leads.length} (sheet rows=${rawRows.length})`,
  );

  console.log("Loading existing questionnaires for dedupe…");
  const existing = await loadExistingIndexes(sb);

  let created = 0;
  let updated = 0;
  let skippedDup = 0;
  let skippedExisting = 0;
  let skippedExcluded = 0;
  let skippedErr = 0;
  const createdNames = [];
  const importedAt = new Date().toISOString();
  const deadPasswordHash = await bcrypt.hash(
    `formgrid-disabled-${randomBytes(16).toString("hex")}`,
    10,
  );

  for (const lead of leads) {
    if (isExcludedName(lead.fields.fullName)) {
      skippedExcluded += 1;
      console.log(`skip excluded: ${lead.fields.fullName}`);
      continue;
    }

    const questionnaireId = mapper.formgridQuestionnaireId(lead.fingerprint);
    const userId = mapper.formgridUserId(lead.fingerprint);
    const passport = normalizePassport(lead.fields.passport);
    const emailNorm = normalizeEmail(lead.fields.email);

    const dupByPassport =
      passport &&
      existing.passports.get(passport) &&
      existing.passports.get(passport) !== questionnaireId
        ? existing.passports.get(passport)
        : null;
    const dupByEmail =
      emailNorm &&
      emailNorm.includes("@") &&
      !emailNorm.endsWith("@import.local") &&
      existing.emails.get(emailNorm) &&
      existing.emails.get(emailNorm) !== questionnaireId
        ? existing.emails.get(emailNorm)
        : null;

    if (dupByPassport || dupByEmail) {
      skippedDup += 1;
      if (skippedDup <= 12) {
        console.log(
          `skip duplicate ${lead.fields.fullName || lead.leadId} → existing ${dupByPassport || dupByEmail}`,
        );
      }
      continue;
    }

    const { data: existingQ } = await sb
      .from("client_portal_questionnaires")
      .select("id, answers, revision, created_at, staff_opened_at")
      .eq("id", questionnaireId)
      .maybeSingle();

    if (createOnly && (existingQ || existing.formgridIds.has(questionnaireId))) {
      skippedExisting += 1;
      continue;
    }

    const answers = mapper.mapFormgridRowToAnswers(lead.sheetColumns, {
      leadId: lead.leadId,
      sheetRow: lead.sheetRow,
      fingerprint: lead.fingerprint,
      importedAt,
    });

    const displayEmail = mapper.syntheticEmailFromFormgrid(
      lead.leadId,
      lead.fields.email,
    );
    const userEmail = `formgrid.${lead.fingerprint}@import.local`;
    const firstName =
      (lead.fields.fullName || "").trim().split(/\s+/)[0] || "Клиент";
    const submittedAt =
      mapper.parseFormgridSubmittedAtIso(lead.fields.submittedAt) || importedAt;

    if (dryRun) {
      if (existingQ) updated += 1;
      else {
        created += 1;
        createdNames.push(lead.fields.fullName || lead.leadId);
      }
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
      console.error("user upsert failed", lead.fingerprint, userError.message);
      skippedErr += 1;
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
        staff_opened_at: existingQ?.staff_opened_at || importedAt,
      },
      { onConflict: "id" },
    );
    if (qError) {
      console.error(
        "questionnaire upsert failed",
        lead.fingerprint,
        qError.message,
      );
      skippedErr += 1;
      continue;
    }

    if (passport) existing.passports.set(passport, questionnaireId);
    if (emailNorm && emailNorm.includes("@")) {
      existing.emails.set(emailNorm, questionnaireId);
    }
    existing.formgridIds.add(questionnaireId);

    if (existingQ) updated += 1;
    else {
      created += 1;
      createdNames.push(lead.fields.fullName || lead.leadId);
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        createOnly,
        totalActive: leads.length,
        created,
        updated,
        skippedDup,
        skippedExisting,
        skippedExcluded,
        skippedErr,
        createdNames,
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
