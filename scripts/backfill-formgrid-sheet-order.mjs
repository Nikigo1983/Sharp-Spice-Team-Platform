/**
 * Backfill __formgridSheetOrder from live Formgrid sheet headers
 * and normalize latin full names to given-surname order.
 *
 *   node --experimental-strip-types --experimental-specifier-resolution=node --import ./scripts/test-register.mjs scripts/backfill-formgrid-sheet-order.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

function loadEnv() {
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

loadEnv();

const dryRun = process.argv.includes("--dry-run");
const mapper = await import(
  pathToFileURL(resolve("src/lib/client-portal/formgrid-import.ts")).href
);
const { formatLatinNameIof } = await import(
  pathToFileURL(resolve("src/lib/client-portal/person-name-order.ts")).href
);

let headers = [];
try {
  const { getFormgridLeadsTable } = await import(
    pathToFileURL(resolve("src/lib/google-sheets/formgrid-leads.ts")).href
  );
  const table = await getFormgridLeadsTable();
  headers = table.headers || [];
} catch (err) {
  console.warn(
    "Formgrid headers unavailable, using numeric/alpha sort:",
    err instanceof Error ? err.message : err,
  );
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: qs, error } = await sb
  .from("client_portal_questionnaires")
  .select("id, answers, revision")
  .eq("status", "submitted");
if (error) throw error;

let updated = 0;
let scanned = 0;
for (const q of qs || []) {
  if (!mapper.isFormgridImport(q.answers || {})) continue;
  scanned += 1;
  const answers = { ...(q.answers || {}) };
  const sheet = answers[mapper.FORMGRID_SHEET_KEY];
  if (!sheet || typeof sheet !== "object" || Array.isArray(sheet)) continue;
  const sheetObj = { ...sheet };
  const sheetKeys = Object.keys(sheetObj);

  let order = [];
  if (headers.length) {
    const present = new Set(sheetKeys);
    order = headers.filter((h) => present.has(h));
    for (const k of sheetKeys) {
      if (!order.includes(k)) order.push(k);
    }
  } else {
    order = sheetKeys.slice().sort((a, b) => {
      const na = a.match(/^(\d+)/);
      const nb = b.match(/^(\d+)/);
      if (na && nb) return Number(na[1]) - Number(nb[1]);
      if (na && !nb) return -1;
      if (!na && nb) return 1;
      return a.localeCompare(b, "ru");
    });
  }

  let dirty = false;
  const prev = answers[mapper.FORMGRID_SHEET_ORDER_KEY];
  if (!(Array.isArray(prev) && JSON.stringify(prev) === JSON.stringify(order))) {
    answers[mapper.FORMGRID_SHEET_ORDER_KEY] = order;
    dirty = true;
  }

  if (typeof answers.full_name_latin === "string" && answers.full_name_latin.trim()) {
    const next = formatLatinNameIof(answers.full_name_latin);
    if (next !== answers.full_name_latin.trim().replace(/\s+/g, " ")) {
      answers.full_name_latin = next;
      dirty = true;
    }
  }

  for (const [key, value] of Object.entries(sheetObj)) {
    if (typeof value !== "string" || !value.trim()) continue;
    if (!/фио.*латин|латин.*фио|latin|отец|мать|father|mother/i.test(key)) {
      continue;
    }
    if (/[а-яё]/i.test(value)) continue;
    const next = formatLatinNameIof(value);
    if (next !== value.trim().replace(/\s+/g, " ")) {
      sheetObj[key] = next;
      dirty = true;
    }
  }
  answers[mapper.FORMGRID_SHEET_KEY] = sheetObj;

  if (!dirty) continue;
  updated += 1;
  if (dryRun) continue;
  const { error: updErr } = await sb
    .from("client_portal_questionnaires")
    .update({
      answers,
      revision: (q.revision || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", q.id);
  if (updErr) console.error(q.id, updErr.message);
}

console.log(
  JSON.stringify(
    { dryRun, scanned, updated, headerCount: headers.length },
    null,
    2,
  ),
);
