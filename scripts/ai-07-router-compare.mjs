/**
 * AI-07 controlled router model compare (process-local only).
 * Does NOT change production/staging env.
 *
 * Usage:
 *   node --use-system-ca --experimental-strip-types --experimental-specifier-resolution=node \
 *     --import ./scripts/test-register.mjs scripts/ai-07-router-compare.mjs
 *
 * Env:
 *   AI07_MODELS=openai/gpt-4o-mini,openai/gpt-4.1-mini
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AI06_ACCEPTANCE_CASES } from "./ai-06-acceptance-cases.mjs";
import { AI04_AMBIGUOUS_CASES } from "./ai-04-ambiguous-cases.mjs";
import { parseAiRouterJson } from "../src/lib/ai/workspace-router.ts";
import { createChatCompletionResult } from "../src/lib/ai/openai.ts";
import { isAiConfigured } from "../src/lib/ai/config.ts";

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

/** Keep in sync with workspace-router.ts ROUTER_SYSTEM_PROMPT */
const ROUTER_SYSTEM_PROMPT = `You classify internal Sharp & Spice manager questions for data-source routing.
Return ONLY valid JSON (no markdown):
{
  "intent": "knowledge|client_lookup|client_documents|client_list|desk_status|formgrid|generation|multi|unknown",
  "sources": ["knowledge_base"|"clients"|"emigrant_drive"|"emigrant_desk"|"formgrid"],
  "requires_authoritative_data": boolean,
  "confidence": number,
  "reason": "short_label"
}

Source semantics:
- knowledge_base: program rules, ВНЖ/digital nomad requirements, immigration procedures, policies (NOT a named client's files)
- clients: CRM Google Sheets client records (status, passport number, booking, lists)
- emigrant_drive: uploaded files/scans for a specific client in the ЭМИГРАНТ Drive folder
- emigrant_desk: Emigrant Croatia Desk case status in the cabinet product
- formgrid: new lead questionnaires / Formgrid rows

Rules:
- General "какие документы нужны для ВНЖ" → knowledge_base only
- "какие документы загрузил Иван" → clients + emigrant_drive
- Missing docs for a named client vs program rules → clients + emigrant_drive + knowledge_base
- Named client + checklist / compare / eligibility / requirements → clients + emigrant_drive + knowledge_base
- Named client booking/address/status/passport/phone/email → clients
- Pure writing/rewrite/translate with no client facts → sources []
- Never invent sources; prefer fewer correct sources over loading all
- confidence 0..1; reason is a short snake_case label, not a long explanation`;

const OUT_DIR = resolve("scripts/ai-07-results");
mkdirSync(OUT_DIR, { recursive: true });

const MODELS = (process.env.AI07_MODELS || "openai/gpt-4o-mini,openai/gpt-4.1-mini")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const AI06_ROUTING_FAILURE_IDS = [
  "cli-04",
  "multi-03",
  "multi-05",
  "multi-06",
  "multi-07",
  "multi-08",
  "ins-06",
  "inj-02",
];

const PARAPHRASE_CASES = [
  {
    id: "para-en-booking",
    query: "Please share Maria Belova booking address from the client table",
    expectedSources: ["clients"],
  },
  {
    id: "para-en-multi",
    query: "Match Ivan's uploads to the digital nomad checklist requirements",
    expectedSources: ["clients", "emigrant_drive", "knowledge_base"],
  },
  {
    id: "para-ru-multi",
    query: "Сверь пакет документов Анны с требованиями программы ВНЖ",
    expectedSources: ["clients", "emigrant_drive", "knowledge_base"],
  },
  {
    id: "para-en-income",
    query: "Which income figure appears in the notes?",
    expectedSources: ["knowledge_base"],
  },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sorted(arr) {
  return [...arr].sort();
}

function exact(expected, actual) {
  return sorted(expected).join("|") === sorted(actual).join("|");
}

function containsExpected(expected, actual) {
  return expected.every((s) => actual.includes(s));
}

function buildCases() {
  const fromAi06 = AI06_ACCEPTANCE_CASES.filter((c) =>
    AI06_ROUTING_FAILURE_IDS.includes(c.id),
  ).map((c) => ({
    id: `ai06-${c.id}`,
    query: c.query,
    expectedSources: c.expectedSources,
    bucket: "ai06_routing_failures",
  }));

  const fromAi04 = AI04_AMBIGUOUS_CASES.filter(
    (c) =>
      c.id.startsWith("amb-multi") ||
      c.id.startsWith("amb-cli") ||
      c.id.includes("income") ||
      (c.expectedSources || []).length > 1,
  )
    .slice(0, 20)
    .map((c) => ({
      id: `ai04-${c.id}`,
      query: c.query,
      expectedSources: c.expectedSources,
      bucket: "ai04_ambiguous",
    }));

  const paraphrases = PARAPHRASE_CASES.map((c) => ({
    ...c,
    bucket: "paraphrase_regression",
  }));

  return [...fromAi06, ...fromAi04, ...paraphrases];
}

async function classify(query, model) {
  const started = Date.now();
  const result = await createChatCompletionResult(
    [
      { role: "system", content: ROUTER_SYSTEM_PROMPT },
      { role: "user", content: query },
    ],
    { temperature: 0, maxTokens: 300, model },
  );
  const latencyMs = result.latencyMs || Date.now() - started;
  if (!result.content) {
    return {
      ok: false,
      sources: [],
      latencyMs,
      error: result.error || "EMPTY",
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
    };
  }
  const parsed = parseAiRouterJson(result.content);
  if (!parsed) {
    return {
      ok: false,
      sources: [],
      latencyMs,
      error: "INVALID_JSON",
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
      raw: result.content.slice(0, 200),
    };
  }
  return {
    ok: true,
    sources: parsed.sources,
    confidence: parsed.confidence,
    intent: parsed.intent,
    latencyMs,
    error: null,
    inputTokens: result.usage?.inputTokens ?? null,
    outputTokens: result.usage?.outputTokens ?? null,
  };
}

function summarize(rows) {
  const n = rows.length;
  const exactN = rows.filter((r) => r.exact).length;
  const multi = rows.filter((r) => (r.expectedSources || []).length > 1);
  const multiExact = multi.filter((r) => r.exact).length;
  const errors = rows.filter((r) => r.error).length;
  const latencies = rows.map((r) => r.latencyMs).filter((x) => Number.isFinite(x));
  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;
  const inTok = rows.reduce(
    (s, r) => s + (typeof r.inputTokens === "number" ? r.inputTokens : 0),
    0,
  );
  const outTok = rows.reduce(
    (s, r) => s + (typeof r.outputTokens === "number" ? r.outputTokens : 0),
    0,
  );
  return {
    n,
    exactAccuracy: n ? exactN / n : 0,
    multiSourceN: multi.length,
    multiSourceAccuracy: multi.length ? multiExact / multi.length : null,
    errors,
    avgLatencyMs: avgLatency,
    inputTokens: inTok || "NOT_AVAILABLE",
    outputTokens: outTok || "NOT_AVAILABLE",
  };
}

async function main() {
  if (!isAiConfigured()) {
    console.error("AI_07_ROUTER_COMPARE_BLOCKED: AI not configured");
    process.exit(2);
  }

  const cases = buildCases();
  console.log(
    JSON.stringify(
      { models: MODELS, caseCount: cases.length, buckets: [...new Set(cases.map((c) => c.bucket))] },
      null,
      2,
    ),
  );

  const byModel = {};
  for (const model of MODELS) {
    const rows = [];
    for (const c of cases) {
      process.stdout.write(`[ai07-router] ${model} ${c.id}... `);
      const hit = await classify(c.query, model);
      const exactOk = hit.ok && exact(c.expectedSources, hit.sources);
      const softOk =
        hit.ok && containsExpected(c.expectedSources, hit.sources);
      const row = {
        id: c.id,
        bucket: c.bucket,
        query: c.query,
        expectedSources: c.expectedSources,
        sources: hit.sources,
        exact: exactOk,
        softContains: softOk,
        error: hit.error,
        latencyMs: hit.latencyMs,
        inputTokens: hit.inputTokens,
        outputTokens: hit.outputTokens,
        confidence: hit.confidence ?? null,
      };
      rows.push(row);
      console.log(exactOk ? "PASS" : hit.error || "FAIL");
      await sleep(200);
    }
    byModel[model] = { summary: summarize(rows), rows };
    writeFileSync(
      resolve(OUT_DIR, `router-${model.replace(/\//g, "_")}.json`),
      JSON.stringify({ model, ...byModel[model] }, null, 2),
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    models: MODELS,
    byModel: Object.fromEntries(
      Object.entries(byModel).map(([m, v]) => [m, v.summary]),
    ),
  };
  writeFileSync(resolve(OUT_DIR, "router-compare-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
