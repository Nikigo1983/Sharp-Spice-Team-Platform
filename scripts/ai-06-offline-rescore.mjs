/**
 * Offline re-score of a saved AI-06 report.json using the corrected scorer.
 * No OpenRouter / model calls.
 *
 * Usage:
 *   node --experimental-strip-types --experimental-specifier-resolution=node \
 *     --import ./scripts/test-register.mjs scripts/ai-06-offline-rescore.mjs \
 *     [path/to/report.json]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  AI06_ACCEPTANCE_CASES,
  AI06_THRESHOLDS,
} from "./ai-06-acceptance-cases.mjs";
import { scoreAnswer, classifyFailure, casePasses } from "./ai-06-scorer.mjs";

const reportPath = resolve(
  process.argv[2] || "scripts/ai-06-results/report.json",
);
const outDir = resolve("scripts/ai-06-results");
mkdirSync(outDir, { recursive: true });

if (!existsSync(reportPath)) {
  console.error("MISSING_REPORT", reportPath);
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const casesById = new Map(AI06_ACCEPTANCE_CASES.map((c) => [c.id, c]));
const oldRows = report.cases || report.rows || [];

function aggregate(rows) {
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
  const n = rows.length;

  return {
    n,
    routingCorrect: n ? rows.filter((r) => r.routingCorrect).length / n : 0,
    retrievalCorrect: n ? rows.filter((r) => r.retrievalCorrect).length / n : 0,
    groundedFactual: groundedCases.length
      ? groundedCases.filter((r) => r.dims.factualSupport && r.dims.noUnsupportedClaims)
          .length / groundedCases.length
      : 0,
    unsupportedClaimRate: n ? unsupportedCount / n : 0,
    insufficientCorrect: insufficient.length
      ? insufficient.filter((r) => r.dims.uncertaintyCorrect && r.dims.noUnsupportedClaims)
          .length / insufficient.length
      : 0,
    attributionCorrect: attributionCases.length
      ? attributionCases.filter((r) => r.dims.sourceAttribution).length /
        attributionCases.length
      : 1,
    injectionResistance: injection.length
      ? injection.filter((r) => r.dims.injectionResistance).length / injection.length
      : 1,
    criticalClientFabrication: criticalFab,
    criticalFalseMissing: criticalMissing,
    overallPassRate: n ? rows.filter((r) => r.pass).length / n : 0,
  };
}

function evalThresholds(summary, t) {
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
    [
      "Source attribution correctness",
      summary.attributionCorrect,
      t.attributionCorrect,
      "gte",
    ],
    [
      "Prompt injection resistance",
      summary.injectionResistance,
      t.injectionResistance,
      "gte",
    ],
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
    const pass =
      mode === "gte" ? result >= threshold : result <= threshold;
    return {
      name,
      result,
      threshold,
      mode,
      pass: pass ? "PASS" : "FAIL",
    };
  });
}

const changed = [];
const newRows = [];

for (const old of oldRows) {
  const c = casesById.get(old.id);
  if (!c) {
    console.warn("UNKNOWN_CASE", old.id);
    newRows.push(old);
    continue;
  }
  const answer = old.answerFullForDebug || old.answerPreview || "";
  if (!answer) {
    console.warn("NO_ANSWER", old.id);
  }
  const dims = scoreAnswer(c, answer, old.attributionLabels || []);
  const row = {
    ...old,
    dims,
    answerFullForDebug: old.answerFullForDebug || answer,
  };
  // Preserve routing/retrieval/model fields from saved artifact
  row.pass = casePasses(row);
  row.failureStage = row.pass ? null : classifyFailure(c, row);

  if (Boolean(old.pass) !== Boolean(row.pass)) {
    changed.push({
      id: old.id,
      before: old.pass,
      after: row.pass,
      beforeStage: old.failureStage,
      afterStage: row.failureStage,
      beforeDims: old.dims,
      afterDims: dims,
      reason: row.pass
        ? "Scorer now accepts semantically equivalent answer"
        : "Scorer still fails / newly fails",
    });
  }
  newRows.push(row);
}

const beforeSummary = report.summary || aggregate(oldRows);
const afterSummary = aggregate(newRows);
const thresholdResults = evalThresholds(afterSummary, AI06_THRESHOLDS);
const failedThresholds = thresholdResults.filter((t) => t.pass === "FAIL").length;
const verdictHint =
  failedThresholds === 0 ? "SCORER_CORRECTION_VALIDATED" : "STILL_FAILING_THRESHOLDS";

const out = {
  sourceReport: reportPath,
  beforeSummary,
  afterSummary,
  thresholdResults,
  failedThresholds,
  verdictHint,
  changed,
  cases: newRows,
};

writeFileSync(
  resolve(outDir, "offline-rescore.json"),
  JSON.stringify(out, null, 2),
  "utf8",
);

console.log(
  JSON.stringify(
    {
      verdictHint,
      failedThresholds,
      beforeOverall: beforeSummary.overallPassRate,
      afterOverall: afterSummary.overallPassRate,
      groundedBefore: beforeSummary.groundedFactual,
      groundedAfter: afterSummary.groundedFactual,
      insufficientBefore: beforeSummary.insufficientCorrect,
      insufficientAfter: afterSummary.insufficientCorrect,
      changedIds: changed.map((c) => `${c.id}:${c.before}->${c.after}`),
      thresholdResults,
    },
    null,
    2,
  ),
);
