/**
 * Migrate stored Cyrillic full names FIO → IOF on portal questionnaires.
 *   node --experimental-strip-types scripts/migrate-names-fio-to-iof.mjs
 *   node --experimental-strip-types scripts/migrate-names-fio-to-iof.mjs --dry-run
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
const { formatCyrillicNameIof } = await import(
  pathToFileURL(resolve("src/lib/client-portal/person-name-order.ts")).href
);

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const pageSize = 200;
let from = 0;
let all = [];
for (;;) {
  const { data, error } = await sb
    .from("client_portal_questionnaires")
    .select("id, answers, revision, first_name")
    .range(from, from + pageSize - 1);
  if (error) throw error;
  const batch = data || [];
  all = all.concat(batch);
  if (batch.length < pageSize) break;
  from += pageSize;
}

let scanned = 0;
let changed = 0;
const samples = [];

for (const q of all) {
  scanned += 1;
  const answers = { ...(q.answers || {}) };
  let dirty = false;

  const cyr = answers.full_name_cyrillic;
  if (typeof cyr === "string" && cyr.trim()) {
    const next = formatCyrillicNameIof(cyr);
    if (next && next !== cyr.trim().replace(/\s+/g, " ")) {
      answers.full_name_cyrillic = next;
      dirty = true;
      if (samples.length < 15) {
        samples.push({ id: q.id, from: cyr, to: next });
      }
    }
  }

  const identity = answers.__identity;
  if (identity && typeof identity === "object" && !Array.isArray(identity)) {
    const idCyr = identity.fullNameCyrillic;
    if (typeof idCyr === "string" && idCyr.trim()) {
      const next = formatCyrillicNameIof(idCyr);
      if (next && next !== idCyr.trim().replace(/\s+/g, " ")) {
        answers.__identity = { ...identity, fullNameCyrillic: next };
        dirty = true;
      }
    }
  }

  const legacySheet = answers.__legacySheet;
  if (legacySheet && typeof legacySheet === "object" && !Array.isArray(legacySheet)) {
    const fam = legacySheet["Фамилия"];
    if (typeof fam === "string" && fam.trim()) {
      const next = formatCyrillicNameIof(fam);
      if (next && next !== fam.trim().replace(/\s+/g, " ")) {
        answers.__legacySheet = { ...legacySheet, Фамилия: next };
        dirty = true;
      }
    }
  }

  if (!dirty) continue;
  changed += 1;
  if (dryRun) continue;

  const { error: updErr } = await sb
    .from("client_portal_questionnaires")
    .update({
      answers,
      revision: (q.revision || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", q.id);
  if (updErr) {
    console.error("update failed", q.id, updErr.message);
  }
}

console.log(
  JSON.stringify(
    { dryRun, scanned, changed, samples },
    null,
    2,
  ),
);
