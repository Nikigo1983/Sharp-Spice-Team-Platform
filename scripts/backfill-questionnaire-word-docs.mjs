/**
 * Backfill Word copies of submitted questionnaires into «Документы по клиенту».
 *
 * Usage:
 *   node --use-system-ca --experimental-strip-types --import ./scripts/test-register.mjs scripts/backfill-questionnaire-word-docs.mjs --local-env
 *   node ... scripts/backfill-questionnaire-word-docs.mjs --local-env --dry-run
 *   node ... scripts/backfill-questionnaire-word-docs.mjs --local-env --limit=20
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const path = join(process.cwd(), name);
    if (!existsSync(path)) continue;
    const values = parseEnv(readFileSync(path, "utf8"));
    for (const [key, value] of Object.entries(values)) {
      if (process.env[key] == null) process.env[key] = value;
    }
  }
}

if (process.argv.includes("--local-env")) {
  loadEnv();
}

const dryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice(8)) : Infinity;

const { listSubmittedForStaff, ensureQuestionnaireWordDocument } =
  await import("../src/lib/client-portal/questionnaire-service.ts");
const { findQuestionnaireWordDocument } = await import(
  "../src/lib/client-portal/questionnaire-word-export.ts"
);
const { readStaffDocuments } = await import(
  "../src/lib/client-portal/staff-case-meta.ts"
);

const all = await listSubmittedForStaff();
const missing = all.filter(
  (row) => !findQuestionnaireWordDocument(readStaffDocuments(row.answers)),
);
const targets = missing.slice(0, Number.isFinite(limit) ? limit : missing.length);

console.log(
  JSON.stringify(
    {
      totalSubmitted: all.length,
      alreadyHaveWord: all.length - missing.length,
      missingWord: missing.length,
      willProcess: targets.length,
      dryRun,
    },
    null,
    2,
  ),
);

let created = 0;
let failed = 0;
for (const row of targets) {
  const label =
    String(row.answers.full_name_cyrillic ?? "").trim() ||
    row.firstName ||
    row.email;
  if (dryRun) {
    console.log(JSON.stringify({ skip: "dry-run", id: row.id, label }));
    continue;
  }
  try {
    const result = await ensureQuestionnaireWordDocument(row.id);
    if (result.created) created += 1;
    console.log(
      JSON.stringify({
        ok: true,
        id: row.id,
        label,
        created: result.created,
        fileName: result.document.fileName,
      }),
    );
  } catch (error) {
    failed += 1;
    console.error(
      JSON.stringify({
        ok: false,
        id: row.id,
        label,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

console.log(JSON.stringify({ created, failed, dryRun }));
if (failed > 0) process.exitCode = 1;
