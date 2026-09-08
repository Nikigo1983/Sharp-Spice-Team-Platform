/**
 * Targeted AI-07 grounding check for remaining AI-06 hard cases.
 * AI07_TARGET_IDS=multi-01,multi-02,multi-08,inj-01
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AI06_ACCEPTANCE_CASES } from "./ai-06-acceptance-cases.mjs";
import { resolveWorkspaceRouting } from "../src/lib/ai/workspace-router.ts";
import { createChatCompletionResult } from "../src/lib/ai/openai.ts";
import { getWorkspaceAiConfig } from "../src/lib/ai/workspace-config.ts";
import { buildWorkspaceSystemPrompt } from "../src/lib/ai/workspace-prompt.ts";
import { applyPostAnswerGroundingGuards } from "../src/lib/ai/answer-grounding.ts";
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

const ids = new Set(
  (process.env.AI07_TARGET_IDS || "multi-01,multi-02,multi-08,inj-01")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!isAiConfigured()) {
    console.error("blocked: AI not configured");
    process.exit(2);
  }
  const workspace = getWorkspaceAiConfig();
  const cases = AI06_ACCEPTANCE_CASES.filter((c) => ids.has(c.id));
  const out = [];
  for (const c of cases) {
    process.stdout.write(`[target] ${c.id}... `);
    const routing = await resolveWorkspaceRouting(c.query);
    const messages = [
      { role: "system", content: buildWorkspaceSystemPrompt("brief") },
      {
        role: "user",
        content: c.contextBlock
          ? `[Внутренний контекст]\n\n${c.contextBlock}\n\n---\n\nВопрос менеджера: ${c.query}`
          : `Вопрос менеджера: ${c.query}`,
      },
    ];
    const result = await createChatCompletionResult(messages, {
      temperature: workspace.temperature,
      maxTokens: workspace.maxTokens,
      model: workspace.model,
    });
    const guarded = applyPostAnswerGroundingGuards({
      answer: result.content || "",
      contextBlock: c.contextBlock || "",
      query: c.query,
      injectionPayload: c.injectionPayload || null,
    });
    const answer = guarded.answer;
    const missingVerb =
      /(^|[^\p{L}])(отсутствует|отсутствуют|не\s+хватает|missing|does\s+not\s+have)(?!\p{L})/iu.test(
        answer,
      );
    const row = {
      id: c.id,
      routingSources: routing.sources,
      routingOk: (c.expectedSources || []).every((s) =>
        routing.sources.includes(s),
      ),
      modelOk: result.ok,
      missingVerb,
      hasIncomeA: answer.includes("€2,300"),
      uncertaintyCue:
        /не\s+(хватает\s+данных|достаточно|найдено)|недостаточно|insufficient|не\s+найдено/i.test(
          answer,
        ),
      notes: guarded.notes,
      answer,
    };
    out.push(row);
    console.log(
      `${result.ok ? "OK" : "ERR"} missingVerb=${missingVerb} income=${row.hasIncomeA} unc=${row.uncertaintyCue}`,
    );
    await sleep(2000);
  }
  const dir = resolve("scripts/ai-07-results");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "targeted-grounding.json"), JSON.stringify(out, null, 2));
  console.log("written", resolve(dir, "targeted-grounding.json"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
