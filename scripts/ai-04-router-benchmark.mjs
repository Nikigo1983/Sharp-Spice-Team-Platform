/**
 * AI-04 Router Model Live Benchmark (temporary, non-production).
 * Usage:
 *   node --use-system-ca --experimental-strip-types --experimental-specifier-resolution=node --import ./scripts/test-register.mjs scripts/ai-04-router-benchmark.mjs
 *
 * Env (process-local only):
 *   AI04_MODELS=openai/gpt-4o-mini,openai/gpt-4.1-mini,openai/gpt-6-astra
 *   AI04_PHASE=pilot|full|consistency|e2e
 *   AI04_LIMIT=N  (optional limit cases)
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AI04_AMBIGUOUS_CASES, summarizeAi04Categories } from "./ai-04-ambiguous-cases.mjs";
import { ROUTING_EVAL_CASES } from "../src/lib/ai/workspace-routing-eval.ts";
import { parseAiRouterJson } from "../src/lib/ai/workspace-router.ts";
import { resolveWorkspaceRouting } from "../src/lib/ai/workspace-router.ts";
import { routeWorkspaceQueryByRules } from "../src/lib/ai/workspace-router-rules.ts";
import { createChatCompletionResult } from "../src/lib/ai/openai.ts";

function loadEnvLocal() {
  const path = ".env.local";
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
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
    if (!(k in process.env) || !String(process.env[k] || "").trim()) {
      process.env[k] = v;
    }
  }
}

loadEnvLocal();

/** Exact copy of production ROUTER_SYSTEM_PROMPT (do not diverge). */
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
- Pure writing/rewrite/translate with no client facts → sources []
- Never invent sources; prefer fewer correct sources over loading all
- confidence 0..1; reason is a short snake_case label, not a long explanation`;

const OUT_DIR = resolve("scripts/ai-04-results");
mkdirSync(OUT_DIR, { recursive: true });

const DEFAULT_MODELS = [
  "openai/gpt-4o-mini",
  "openai/gpt-4.1-mini",
  "openai/gpt-6-astra",
];

const models = (process.env.AI04_MODELS || DEFAULT_MODELS.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const phase = process.env.AI04_PHASE || "pilot";
const limit = process.env.AI04_LIMIT
  ? Number(process.env.AI04_LIMIT)
  : null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sortedSources(sources) {
  return [...sources].sort();
}

function exactMatch(expected, actual) {
  const a = sortedSources(expected).join("|");
  const b = sortedSources(actual).join("|");
  return a === b;
}

function classifyError(expected, actual, validJson, modelError) {
  if (modelError) return "MODEL_ERROR";
  if (!validJson) return "INVALID_JSON";
  if (exactMatch(expected, actual)) return null;

  const exp = new Set(expected);
  const act = new Set(actual);
  const hasKb = act.has("knowledge_base");
  const hasCli = act.has("clients");
  const hasDrive = act.has("emigrant_drive");
  const expKb = exp.has("knowledge_base");
  const expCli = exp.has("clients");
  const expDrive = exp.has("emigrant_drive");
  const expEmpty = expected.length === 0;

  if (expEmpty && actual.length > 0) return "GENERATION_MISROUTED";
  if (expKb && !expCli && !expDrive && hasCli && !hasKb) return "KB_AS_CLIENT";
  if (expKb && !expDrive && hasDrive && !hasKb) return "KB_AS_DRIVE";
  if ((expCli || expDrive) && !expKb && hasKb && !hasCli && !hasDrive)
    return "CLIENT_AS_KB";
  if (expDrive && !hasDrive && hasKb) return "DRIVE_AS_KB";
  if (expected.length >= 2 && actual.length < expected.length)
    return "MISSED_MULTI_SOURCE";
  if (actual.some((s) => !exp.has(s))) return "UNNECESSARY_SOURCE";
  return "OTHER";
}

function detectLanguage(query) {
  return /[а-яё]/i.test(query) ? "ru" : "en";
}

async function classifyWithModel(model, query) {
  const started = Date.now();
  const result = await createChatCompletionResult(
    [
      { role: "system", content: ROUTER_SYSTEM_PROMPT },
      { role: "user", content: query },
    ],
    {
      temperature: 0,
      maxTokens: 300,
      model,
    },
  );
  const latencyMs = result.latencyMs || Date.now() - started;
  if (!result.content) {
    return {
      validJson: false,
      sources: [],
      confidence: null,
      reason: null,
      intent: null,
      latencyMs,
      inputTokens: result.usage?.inputTokens ?? "NOT_AVAILABLE",
      outputTokens: result.usage?.outputTokens ?? "NOT_AVAILABLE",
      returnedModel: result.returnedModel,
      error: result.error || "MODEL_ERROR",
    };
  }
  const parsed = parseAiRouterJson(result.content);
  if (!parsed) {
    return {
      validJson: false,
      sources: [],
      confidence: null,
      reason: null,
      intent: null,
      latencyMs,
      inputTokens: result.usage?.inputTokens ?? "NOT_AVAILABLE",
      outputTokens: result.usage?.outputTokens ?? "NOT_AVAILABLE",
      returnedModel: result.returnedModel,
      error: "INVALID_JSON",
      rawPreview: result.content.slice(0, 200),
    };
  }
  return {
    validJson: true,
    sources: parsed.sources,
    confidence: parsed.confidence,
    reason: parsed.reason,
    intent: parsed.intent,
    latencyMs,
    inputTokens: result.usage?.inputTokens ?? "NOT_AVAILABLE",
    outputTokens: result.usage?.outputTokens ?? "NOT_AVAILABLE",
    returnedModel: result.returnedModel,
    error: null,
  };
}

async function fetchPricing(modelIds) {
  const key = (process.env.OPENROUTER_API_KEY || "").trim();
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return {};
  const data = await res.json();
  /** @type {Record<string, {prompt:number, completion:number}>} */
  const out = {};
  for (const m of data.data || []) {
    if (!modelIds.includes(m.id)) continue;
    const p = Number(m.pricing?.prompt);
    const c = Number(m.pricing?.completion);
    if (Number.isFinite(p) && Number.isFinite(c)) {
      out[m.id] = { prompt: p, completion: c };
    }
  }
  return out;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

function summarizeRows(rows) {
  const n = rows.length;
  const correct = rows.filter((r) => r.correct).length;
  const invalid = rows.filter((r) => r.validJson === false).length;
  const errors = rows.filter((r) => Boolean(r.error) && r.error !== "INVALID_JSON").length;
  const latencies = rows.map((r) => r.latencyMs).filter((x) => typeof x === "number").sort((a, b) => a - b);
  const ru = rows.filter((r) => r.language === "ru");
  const en = rows.filter((r) => r.language === "en");
  const multi = rows.filter((r) => r.category === "multi" || (r.expectedSources?.length ?? 0) >= 2);

  /** @type {Record<string, number>} */
  const failCats = {};
  for (const r of rows) {
    if (r.correct) continue;
    failCats[r.failureCategory || "OTHER"] =
      (failCats[r.failureCategory || "OTHER"] ?? 0) + 1;
  }

  let inputSum = 0;
  let outputSum = 0;
  let tokenComplete = 0;
  for (const r of rows) {
    if (typeof r.inputTokens === "number" && typeof r.outputTokens === "number") {
      inputSum += r.inputTokens;
      outputSum += r.outputTokens;
      tokenComplete += 1;
    }
  }

  return {
    n,
    exactAccuracy: n ? correct / n : 0,
    russianAccuracy: ru.length ? ru.filter((r) => r.correct).length / ru.length : null,
    englishAccuracy: en.length ? en.filter((r) => r.correct).length / en.length : null,
    multiAccuracy: multi.length
      ? multi.filter((r) => r.correct).length / multi.length
      : null,
    invalidJsonRate: n ? invalid / n : 0,
    errorRate: n ? errors / n : 0,
    latency: {
      median: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      min: latencies[0] ?? null,
      max: latencies[latencies.length - 1] ?? null,
    },
    tokens: {
      rowsWithUsage: tokenComplete,
      inputSum,
      outputSum,
      avgInput: tokenComplete ? inputSum / tokenComplete : null,
      avgOutput: tokenComplete ? outputSum / tokenComplete : null,
    },
    failureCategories: failCats,
  };
}

function estimateCost(summary, pricing) {
  if (!pricing || summary.tokens.rowsWithUsage === 0) {
    return { status: "COST_NOT_VERIFIED", per1k: null, per10k: null };
  }
  const avgIn = summary.tokens.avgInput;
  const avgOut = summary.tokens.avgOutput;
  if (avgIn == null || avgOut == null) {
    return { status: "COST_NOT_VERIFIED", per1k: null, per10k: null };
  }
  const perRequest = avgIn * pricing.prompt + avgOut * pricing.completion;
  return {
    status: "OK",
    perRequestUsd: perRequest,
    per1k: perRequest * 1000,
    per10k: perRequest * 10000,
    pricing,
  };
}

async function runAiClassifier(cases, model) {
  const rows = [];
  for (const c of cases) {
    const out = await classifyWithModel(model, c.query);
    const correct =
      out.validJson && !out.error && exactMatch(c.expectedSources, out.sources);
    const failureCategory = classifyError(
      c.expectedSources,
      out.sources,
      out.validJson,
      out.error && out.error !== "INVALID_JSON" ? out.error : null,
    );
    rows.push({
      caseId: c.id,
      language: c.language || detectLanguage(c.query),
      category: c.category,
      question: c.query,
      expectedSources: c.expectedSources,
      model,
      returnedSources: out.sources,
      confidence: out.confidence,
      validJson: out.validJson,
      correct,
      latencyMs: out.latencyMs,
      inputTokens: out.inputTokens,
      outputTokens: out.outputTokens,
      error: out.error,
      failureCategory: correct ? null : failureCategory,
      returnedModel: out.returnedModel,
    });
    await sleep(150);
  }
  return rows;
}

async function runE2E(cases, model) {
  const prev = process.env.AI_WORKSPACE_ROUTER_MODEL;
  process.env.AI_WORKSPACE_ROUTER_MODEL = model;
  const rows = [];
  try {
    for (const c of cases) {
      const rulePeek = routeWorkspaceQueryByRules(c.query);
      const started = Date.now();
      const decision = await resolveWorkspaceRouting(c.query);
      const latencyMs = Date.now() - started;
      const correct = exactMatch(c.expectedSources, decision.sources);
      rows.push({
        caseId: c.id,
        language: detectLanguage(c.query),
        category: c.category,
        question: c.query,
        expectedSources: c.expectedSources,
        model,
        returnedSources: decision.sources,
        confidence: decision.confidence,
        validJson: true,
        correct,
        latencyMs,
        inputTokens: "NOT_AVAILABLE",
        outputTokens: "NOT_AVAILABLE",
        error: decision.fallbackUsed ? decision.fallbackReason : null,
        failureCategory: correct
          ? null
          : classifyError(c.expectedSources, decision.sources, true, null),
        routingMethod: decision.method,
        ruleWouldSkipAi:
          rulePeek.highConfidence && rulePeek.decision.confidence >= 0.75,
      });
      await sleep(150);
    }
  } finally {
    if (prev === undefined) delete process.env.AI_WORKSPACE_ROUTER_MODEL;
    else process.env.AI_WORKSPACE_ROUTER_MODEL = prev;
  }
  return rows;
}

function methodDistribution(rows) {
  /** @type {Record<string, number>} */
  const d = { DIRECT: 0, RULE: 0, AI: 0, FALLBACK: 0 };
  for (const r of rows) {
    const m = r.routingMethod || "UNKNOWN";
    d[m] = (d[m] ?? 0) + 1;
  }
  return d;
}

async function runConsistency(cases, model, runs = 3) {
  const subset = cases.slice(0, 10);
  const byCase = [];
  for (const c of subset) {
    const runsOut = [];
    for (let i = 0; i < runs; i++) {
      const out = await classifyWithModel(model, c.query);
      runsOut.push(sortedSources(out.sources).join("|"));
      await sleep(150);
    }
    const unique = new Set(runsOut);
    byCase.push({
      caseId: c.id,
      runs: runsOut,
      consistent: unique.size === 1,
    });
  }
  const consistent = byCase.filter((x) => x.consistent).length;
  return {
    model,
    n: byCase.length,
    runsPerCase: runs,
    consistencyRate: byCase.length ? consistent / byCase.length : 0,
    details: byCase,
  };
}

async function main() {
  if (!(process.env.OPENROUTER_API_KEY || "").trim()) {
    console.error("BLOCKED: OPENROUTER_API_KEY missing");
    process.exit(2);
  }

  const pricing = await fetchPricing(models);
  console.log(
    JSON.stringify(
      {
        phase,
        models,
        pricingFound: Object.keys(pricing),
        ambiguousCases: AI04_AMBIGUOUS_CASES.length,
        e2eCases: ROUTING_EVAL_CASES.length,
        ambiguousCategories: summarizeAi04Categories(),
      },
      null,
      2,
    ),
  );

  let aiCases = AI04_AMBIGUOUS_CASES;
  let e2eCases = ROUTING_EVAL_CASES;
  if (limit && Number.isFinite(limit)) {
    aiCases = aiCases.slice(0, limit);
    e2eCases = e2eCases.slice(0, limit);
  }

  if (phase === "pilot") {
    // Cheap smoke: 3 AI cases × all models; abort if projected cost high for astra
    const pilotCases = AI04_AMBIGUOUS_CASES.slice(0, 3);
    /** @type {Record<string, any>} */
    const pilot = {};
    for (const model of models) {
      const rows = await runAiClassifier(pilotCases, model);
      const summary = summarizeRows(rows);
      const cost = estimateCost(summary, pricing[model]);
      const projectedFull =
        cost.perRequestUsd != null
          ? cost.perRequestUsd * AI04_AMBIGUOUS_CASES.length
          : null;
      pilot[model] = { summary, cost, projectedFullAiSetUsd: projectedFull, sample: rows };
      console.log(
        `[pilot] ${model} accuracy=${summary.exactAccuracy} projectedFull≈${projectedFull}`,
      );
      if (
        model.includes("gpt-6") &&
        projectedFull != null &&
        projectedFull > 5
      ) {
        console.error("STOP: projected gpt-6 full AI set cost > $5");
        writeFileSync(
          resolve(OUT_DIR, "pilot-stop.json"),
          JSON.stringify({ pilot, stop: true }, null, 2),
        );
        process.exit(3);
      }
    }
    writeFileSync(resolve(OUT_DIR, "pilot.json"), JSON.stringify(pilot, null, 2));
    console.log("PILOT_OK");
    return;
  }

  /** @type {Record<string, any>} */
  const report = {
    generatedAt: new Date().toISOString(),
    models,
    pricing,
    datasets: {
      e2e: ROUTING_EVAL_CASES.length,
      aiClassifier: AI04_AMBIGUOUS_CASES.length,
      categories: summarizeAi04Categories(),
    },
    e2e: {},
    aiClassifier: {},
    consistency: {},
  };

  if (phase === "e2e" || phase === "full") {
    for (const model of models) {
      console.log(`[e2e] ${model} n=${e2eCases.length}`);
      const rows = await runE2E(e2eCases, model);
      const summary = summarizeRows(rows);
      report.e2e[model] = {
        summary,
        methodDistribution: methodDistribution(rows),
        rows,
      };
      writeFileSync(
        resolve(OUT_DIR, `e2e-${model.replace(/\//g, "_")}.json`),
        JSON.stringify({ summary, rows }, null, 2),
      );
    }
  }

  if (phase === "ai" || phase === "full") {
    for (const model of models) {
      console.log(`[ai] ${model} n=${aiCases.length}`);
      const rows = await runAiClassifier(aiCases, model);
      const summary = summarizeRows(rows);
      const cost = estimateCost(summary, pricing[model]);
      report.aiClassifier[model] = { summary, cost, rows };
      writeFileSync(
        resolve(OUT_DIR, `ai-${model.replace(/\//g, "_")}.json`),
        JSON.stringify({ summary, cost, rows }, null, 2),
      );
    }
  }

  if (phase === "consistency" || phase === "full") {
    for (const model of models) {
      console.log(`[consistency] ${model}`);
      report.consistency[model] = await runConsistency(aiCases, model, 3);
    }
  }

  writeFileSync(resolve(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log("BENCHMARK_WRITTEN", resolve(OUT_DIR, "report.json"));
}

main().catch((err) => {
  console.error("BENCHMARK_FAILED", err?.message || err);
  process.exit(1);
});
