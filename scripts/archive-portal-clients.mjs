/**
 * Archive named completed clients in portal intake.
 *
 *   node --experimental-strip-types scripts/archive-portal-clients.mjs
 *   node --experimental-strip-types scripts/archive-portal-clients.mjs --dry-run
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const ARCHIVE_TARGETS = [
  "Бороденков",
  "Бороденкова",
  "Буева",
  "Воскресенская",
  "Гликина",
  "Гулин",
  "Гусина",
  "Гусева",
  "Душкин",
  "Едрец",
  "Жамаль",
  "Зимина",
  "Илья Вайнер",
  "Кирий Андрей",
  "Киселева",
  "Козлов Сергей",
  "Махмудов",
  "Мирумян",
  "Насибхужаев",
  "Нестеров",
  "Пастухов Артем",
  "Протуро Иван",
  "Самко",
  "Сафронова",
  "Смоленская (Израиль)",
  "Соколова Екатерина",
  "Таневский",
  "Хуторянская",
  "Щедрин",
  "Щепановска",
];

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

function displayNameFromAnswers(row) {
  const answers = row.answers || {};
  const identity = answers.__identity || {};
  return (
    String(identity.fullNameCyrillic || "").trim() ||
    String(answers.full_name_cyrillic || "").trim() ||
    String(answers.__legacySheet?.Фамилия || "").trim() ||
    String(row.first_name || "").trim() ||
    String(row.email || "").trim()
  );
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  }

  const { clientNameMatchesTarget } = await import(
    pathToFileURL(resolve("src/lib/client-portal/case-archive.ts")).href
  );

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await sb
    .from("client_portal_questionnaires")
    .select("id, email, first_name, answers, revision, status")
    .eq("status", "submitted");
  if (error) throw error;

  const rows = data ?? [];
  const matched = [];
  const unmatchedTargets = [...ARCHIVE_TARGETS];

  for (const row of rows) {
    const name = displayNameFromAnswers(row);
    const hit = ARCHIVE_TARGETS.find((target) =>
      clientNameMatchesTarget(name, target),
    );
    if (!hit) continue;
    matched.push({ row, name, target: hit });
    const idx = unmatchedTargets.indexOf(hit);
    if (idx >= 0) unmatchedTargets.splice(idx, 1);
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        totalSubmitted: rows.length,
        matched: matched.map((m) => ({
          id: m.row.id,
          name: m.name,
          target: m.target,
        })),
        unmatchedTargets,
      },
      null,
      2,
    ),
  );

  if (dryRun) return;

  const now = new Date().toISOString();
  let updated = 0;
  for (const item of matched) {
    const answers = {
      ...(item.row.answers || {}),
      __archive: {
        archived: true,
        archivedAt: now,
        archivedByName: "Система",
        archivedByUserId: "system-archive",
      },
    };
    const { error: upErr } = await sb
      .from("client_portal_questionnaires")
      .update({
        answers,
        updated_at: now,
        revision: (item.row.revision ?? 0) + 1,
      })
      .eq("id", item.row.id);
    if (upErr) {
      console.error("failed", item.row.id, upErr.message);
      continue;
    }
    updated += 1;
  }
  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
