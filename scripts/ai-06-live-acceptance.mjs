/**
 * AI-06 Live End-to-End Acceptance Evaluation
 * Usage:
 *   AI06_PHASE=pilot|full node --use-system-ca --experimental-strip-types \
 *     --experimental-specifier-resolution=node --import ./scripts/test-register.mjs \
 *     scripts/ai-06-live-acceptance.mjs
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AI06_ACCEPTANCE_CASES,
  AI06_THRESHOLDS,
  summarizeAcceptanceCategories,
} from "./ai-06-acceptance-cases.mjs";
import {
  scoreAnswer,
  classifyFailure,
  casePasses,
} from "./ai-06-scorer.mjs";
import { resolveWorkspaceRouting } from "../src/lib/ai/workspace-router.ts";
import { createChatCompletionResult } from "../src/lib/ai/openai.ts";
import { getWorkspaceAiConfig } from "../src/lib/ai/workspace-config.ts";
import { buildWorkspaceSystemPrompt } from "../src/lib/ai/workspace-prompt.ts";
import { KB_SAFE_GROUNDING_REPLY } from "../src/lib/ai/kb-grounding.ts";
import { getAiRuntimeConfig, isAiConfigured } from "../src/lib/ai/config.ts";
import { getWorkspaceRouterModel } from "../src/lib/ai/workspace-router.ts";
import { applyPostAnswerGroundingGuards } from "../src/lib/ai/answer-grounding.ts";

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

const OUT_DIR = resolve("scripts/ai-06-results");
mkdirSync(OUT_DIR, { recursive: true });

const phase = process.env.AI06_PHASE || "pilot";
const limit = process.env.AI06_LIMIT ? Number(process.env.AI06_LIMIT) : null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sorted(arr) {
  return [...arr].sort();
}

function exactSources(expected, actual) {
  return sorted(expected).join("|") === sorted(actual).join("|");
}

function sourcesContainExpected(expected, actual) {
  // Soft: all expected sources present (extra OK for multi)
  return expected.every((s) => actual.includes(s));
}

function percentile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

function buildAttributionForCase(c) {
  if (c.kbGroundingBlock) return ["Knowledge Base — недостаточно данных"];
  if (c.attributionExpected?.length) return [...c.attributionExpected];
  if (c.pureGeneration) return [];
  // Derive from context SOURCE titles roughly
  const labels = [];
  const re = /\[SOURCE:(KB|DRIVE|CLIENT):(\d+)\]\s*\nTitle:\s*(.+)/g;
  let m;
  while ((m = re.exec(c.contextBlock || ""))) {
    const kind =
      m[1] === "KB"
        ? "Knowledge Base"
        : m[1] === "DRIVE"
          ? "Emigrant Drive"
          : "Client record";
    labels.push(`${kind} — ${m[3].trim()}`);
  }
  return labels;
}

async function callFinalModel(c) {
  const workspace = getWorkspaceAiConfig();
  const history = (c.history || []).slice(-4);
  const messages = [
    { role: "system", content: buildWorkspaceSystemPrompt("brief") },
    ...history,
    {
      role: "user",
      content: c.contextBlock
        ? `[Внутренний контекст платформы — не цитируй целиком]\n\n${c.contextBlock}\n\n---\n\nВопрос менеджера: ${c.query}`
        : `Вопрос менеджера: ${c.query}`,
    },
  ];

  if (c.kbGroundingBlock) {
    return {
      answer: KB_SAFE_GROUNDING_REPLY,
      requestedModel: workspace.model || "blocked-no-call",
      returnedModel: "AI01_SAFE_REPLY",
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      ok: true,
      blockedByAi01: true,
    };
  }

  const started = Date.now();
  let result = null;
  const maxAttempts = Number(process.env.AI06_MAX_ATTEMPTS || 4);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    result = await createChatCompletionResult(messages, {
      temperature: workspace.temperature,
      maxTokens: workspace.maxTokens,
      model: workspace.model,
    });
    if (result.ok && result.content) break;
    const errText = String(result.error || result.content || "");
    const retryable =
      /402|in_flight|rate|credits|Retry-After|timeout|429/i.test(errText) ||
      (!result.content && !result.ok);
    if (!retryable || attempt === maxAttempts) break;
    const waitMs = Math.min(180000, 15000 * attempt);
    console.log(`(retry ${attempt}/${maxAttempts} in ${waitMs}ms)`);
    await sleep(waitMs);
  }
  const rawAnswer = result?.content || "";
  const guarded = applyPostAnswerGroundingGuards({
    answer: rawAnswer,
    contextBlock: c.contextBlock || "",
    query: c.query,
    injectionPayload: c.injectionPayload || null,
  });
  return {
    answer: guarded.answer,
    requestedModel: result?.requestedModel,
    returnedModel: result?.returnedModel,
    latencyMs: result?.latencyMs || Date.now() - started,
    inputTokens: result?.usage?.inputTokens ?? "NOT_AVAILABLE",
    outputTokens: result?.usage?.outputTokens ?? "NOT_AVAILABLE",
    ok: Boolean(result?.ok),
    error: result?.error,
    blockedByAi01: false,
  };
}

async function runCase(c) {
  const routing = await resolveWorkspaceRouting(c.query);
  const routingSources = routing.sources;
  const routingCorrect = c.pureGeneration
    ? routingSources.length === 0 || exactSources(c.expectedSources, routingSources)
    : c.expectedSources.length === 0
      ? routingSources.length === 0
      : sourcesContainExpected(c.expectedSources, routingSources) ||
        exactSources(c.expectedSources, routingSources);

  // Retrieval correctness: fixture evidence present when expected for non-block cases
  let retrievalCorrect = true;
  if (c.kbGroundingBlock) {
    retrievalCorrect = true; // intentional empty
  } else if (c.pureGeneration) {
    retrievalCorrect = !(c.contextBlock || "").includes("[SOURCE:");
  } else if ((c.mustInclude || []).length > 0) {
    retrievalCorrect = (c.mustInclude || []).every((f) =>
      (c.contextBlock || "").includes(f),
    );
  } else {
    retrievalCorrect = Boolean(c.contextBlock);
  }

  const attributionLabels = buildAttributionForCase(c);
  const model = await callFinalModel(c);
  const dims = scoreAnswer(c, model.answer, attributionLabels);

  const row = {
    id: c.id,
    language: c.language,
    category: c.category,
    query: c.query,
    expectedSources: c.expectedSources,
    routingMethod: routing.method,
    routingSources,
    routingConfidence: routing.confidence,
    routerModel: routing.routerModelRequested,
    routingCorrect,
    retrievalCorrect,
    attributionLabels,
    dims,
    answerPreview: (model.answer || "").slice(0, 400),
    answerFullForDebug: process.env.AI06_DEBUG_ANSWERS
      ? model.answer
      : undefined,
    requestedModel: model.requestedModel,
    returnedModel: model.returnedModel,
    latencyMs: model.latencyMs,
    inputTokens: model.inputTokens,
    outputTokens: model.outputTokens,
    modelError: model.ok ? null : model.error || "MODEL_ERROR",
    blockedByAi01: model.blockedByAi01,
  };

  row.pass = casePasses(row);
  row.failureStage = row.pass ? null : classifyFailure(c, row);
  return row;
}

function aggregate(rows) {
  const n = rows.length;
  const rate = (pred) => (n ? rows.filter(pred).length / n : 0);

  const factualRows = rows.filter(
    (r) =>
      !["generation"].includes(r.category) ||
      r.category === "kb_factual" ||
      r.category === "client_factual" ||
      r.category === "multi" ||
      r.category === "emigrant_drive" ||
      r.category === "history",
  );
  // clearer: grounded factual = cases that require factual support
  const groundedCases = rows.filter((r) =>
    ["kb_factual", "client_factual", "emigrant_drive", "multi", "history", "injection"].includes(
      r.category,
    ),
  );
  const insufficient = rows.filter((r) => r.category === "insufficient");
  const injection = rows.filter((r) => r.category === "injection");
  const attributionCases = rows.filter(
    (r) => (r.attributionLabels?.length ?? 0) > 0 || r.category === "generation",
  );

  const unsupportedCount = rows.filter((r) => !r.dims.noUnsupportedClaims).length;
  const criticalFab = rows.filter((r) => r.dims.criticalClientFabrication).length;
  const criticalMissing = rows.filter((r) => r.dims.criticalFalseMissing).length;

  const latencies = rows
    .filter((r) => !r.blockedByAi01 && typeof r.latencyMs === "number")
    .map((r) => r.latencyMs);

  let inSum = 0;
  let outSum = 0;
  let tokN = 0;
  for (const r of rows) {
    if (typeof r.inputTokens === "number" && typeof r.outputTokens === "number") {
      inSum += r.inputTokens;
      outSum += r.outputTokens;
      tokN += 1;
    }
  }

  return {
    n,
    routingCorrect: rate((r) => r.routingCorrect),
    retrievalCorrect: rate((r) => r.retrievalCorrect),
    groundedFactual: groundedCases.length
      ? groundedCases.filter((r) => r.dims.factualSupport && r.dims.noUnsupportedClaims).length /
        groundedCases.length
      : 1,
    unsupportedClaimRate: n ? unsupportedCount / n : 0,
    insufficientCorrect: insufficient.length
      ? insufficient.filter((r) => r.dims.uncertaintyCorrect && r.dims.noUnsupportedClaims)
          .length / insufficient.length
      : 1,
    attributionCorrect: attributionCases.length
      ? attributionCases.filter((r) => r.dims.sourceAttribution).length /
        attributionCases.length
      : 1,
    injectionResistance: injection.length
      ? injection.filter((r) => r.dims.injectionResistance).length / injection.length
      : 1,
    criticalClientFabrication: criticalFab,
    criticalFalseMissing: criticalMissing,
    overallPassRate: rate((r) => r.pass),
    latency: {
      median: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      min: latencies.length ? Math.min(...latencies) : null,
      max: latencies.length ? Math.max(...latencies) : null,
      n: latencies.length,
    },
    tokens: {
      rowsWithUsage: tokN,
      avgInput: tokN ? inSum / tokN : null,
      avgOutput: tokN ? outSum / tokN : null,
      inputSum: inSum,
      outputSum: outSum,
    },
    byCategory: Object.fromEntries(
      [...new Set(rows.map((r) => r.category))].map((cat) => [
        cat,
        {
          n: rows.filter((r) => r.category === cat).length,
          pass: rows.filter((r) => r.category === cat && r.pass).length,
        },
      ]),
    ),
    failureStages: rows
      .filter((r) => !r.pass)
      .reduce((acc, r) => {
        const k = r.failureStage || "UNKNOWN";
        acc[k] = acc[k] || [];
        acc[k].push(r.id);
        return acc;
      }, {}),
  };
}

function evaluateThresholds(summary) {
  const t = AI06_THRESHOLDS;
  const checks = [
    ["Routing correctness", summary.routingCorrect, t.routingCorrect, "gte"],
    ["Retrieval correctness", summary.retrievalCorrect, t.retrievalCorrect, "gte"],
    ["Grounded factual correctness", summary.groundedFactual, t.groundedFactual, "gte"],
    [
      "Unsupported factual claim rate",
      summary.unsupportedClaimRate,
      t.unsupportedClaimRateMax,
      "lte",
    ],
    [
      "Correct insufficient-evidence behavior",
      summary.insufficientCorrect,
      t.insufficientCorrect,
      "gte",
    ],
    ["Source attribution correctness", summary.attributionCorrect, t.attributionCorrect, "gte"],
    ["Prompt injection resistance", summary.injectionResistance, t.injectionResistance, "gte"],
    [
      "Critical client-data fabrication",
      summary.criticalClientFabrication,
      t.criticalClientFabricationMax,
      "lte",
    ],
    [
      "Critical false document-missing claims",
      summary.criticalFalseMissing,
      t.criticalFalseMissingMax,
      "lte",
    ],
  ];
  return checks.map(([name, result, threshold, mode]) => {
    const pass = mode === "gte" ? result >= threshold : result <= threshold;
    return { name, result, threshold, mode, pass: pass ? "PASS" : "FAIL" };
  });
}

async function fetchClaudePricing() {
  const key = (process.env.OPENROUTER_API_KEY || "").trim();
  const model = getWorkspaceAiConfig().model;
  if (!key || !model) return null;
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const hit = (data.data || []).find((m) => m.id === model);
  if (!hit?.pricing) return null;
  const prompt = Number(hit.pricing.prompt);
  const completion = Number(hit.pricing.completion);
  if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return null;
  return { model, prompt, completion };
}

async function main() {
  if (!isAiConfigured()) {
    console.error("AI_06_ACCEPTANCE_BLOCKED: AI not configured");
    process.exit(2);
  }

  const rt = getAiRuntimeConfig();
  const workspace = getWorkspaceAiConfig();
  const summaryMeta = summarizeAcceptanceCategories();
  console.log(
    JSON.stringify(
      {
        phase,
        thresholdsLocked: AI06_THRESHOLDS,
        dataset: summaryMeta,
        config: {
          provider: rt?.provider,
          host: rt ? new URL(rt.completionsUrl).host : null,
          workspaceModel: workspace.model,
          routerModelResolved: getWorkspaceRouterModel() || null,
        },
      },
      null,
      2,
    ),
  );

  // Persist thresholds before scoring begins
  writeFileSync(
    resolve(OUT_DIR, "thresholds-locked.json"),
    JSON.stringify(
      { lockedAt: new Date().toISOString(), thresholds: AI06_THRESHOLDS },
      null,
      2,
    ),
  );

  let cases = AI06_ACCEPTANCE_CASES;
  if (phase === "pilot") cases = cases.slice(0, 3);
  if (limit && Number.isFinite(limit)) cases = cases.slice(0, limit);

  const rows = [];
  for (const c of cases) {
    process.stdout.write(`[ai06] ${c.id}... `);
    try {
      const row = await runCase(c);
      rows.push(row);
      console.log(row.pass ? "PASS" : `FAIL:${row.failureStage}`);
    } catch (err) {
      console.log("ERROR");
      rows.push({
        id: c.id,
        category: c.category,
        query: c.query,
        pass: false,
        failureStage: "UNKNOWN",
        modelError: err?.message || String(err),
        dims: {
          factualSupport: false,
          noUnsupportedClaims: false,
          uncertaintyCorrect: false,
          conflictHandling: false,
          sourceAttribution: false,
          multiSourceReasoning: false,
          injectionResistance: false,
          answerUsefulness: false,
          criticalClientFabrication: false,
          criticalFalseMissing: false,
        },
        routingCorrect: false,
        retrievalCorrect: false,
      });
    }
    await sleep(Number(process.env.AI06_SLEEP_MS || 1200));
  }

  const summary = aggregate(rows);
  const thresholdResults = evaluateThresholds(summary);
  const pricing = await fetchClaudePricing();
  let cost = { status: "COST_NOT_VERIFIED" };
  if (pricing && summary.tokens.avgInput != null && summary.tokens.avgOutput != null) {
    const per =
      summary.tokens.avgInput * pricing.prompt +
      summary.tokens.avgOutput * pricing.completion;
    cost = {
      status: "OK",
      pricing,
      perRequestUsd: per,
      per100: per * 100,
      per1000: per * 1000,
    };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    phase,
    thresholds: AI06_THRESHOLDS,
    thresholdResults,
    summary,
    cost,
    config: {
      workspaceModel: workspace.model,
      routerModelResolved: getWorkspaceRouterModel() || null,
    },
    rows,
  };

  writeFileSync(resolve(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    resolve(OUT_DIR, "summary.json"),
    JSON.stringify({ thresholdResults, summary, cost }, null, 2),
  );
  console.log("AI06_WRITTEN", resolve(OUT_DIR, "report.json"));
  const failedThresholds = thresholdResults.filter((t) => t.pass === "FAIL").length;
  console.log(
    JSON.stringify(
      {
        overallPassRate: summary.overallPassRate,
        failedThresholds,
        verdictHint:
          failedThresholds === 0
            ? "READY_FOR_CONTROLLED_STAGING"
            : "NOT_READY_FOR_STAGING",
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("AI06_FAILED", err?.message || err);
  process.exit(1);
});
