/**
 * Representative Astra credit preflight — enough max_tokens for a real answer.
 */
import { existsSync, readFileSync } from "node:fs";

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
process.env.AI_WORKSPACE_MODEL = "openai/gpt-6-astra";
process.env.AI_WORKSPACE_ROUTER_MODEL = "openai/gpt-6-astra";
process.env.OPENROUTER_MODEL = "openai/gpt-6-astra";

const { createChatCompletionResult } = await import("../src/lib/ai/openai.ts");

const result = await createChatCompletionResult(
  [
    {
      role: "system",
      content:
        "You are a brief internal assistant. Answer in 2-3 short sentences.",
    },
    {
      role: "user",
      content:
        "Explain in two sentences what digital nomad residence requirements typically cover, without inventing exact income numbers.",
    },
  ],
  { maxTokens: 400, model: "openai/gpt-6-astra" },
);

const err = String(result.error || "");
const blocked402 = /402|credits|afford/i.test(err);

console.log(
  JSON.stringify(
    {
      ok: result.ok,
      requestedModel: result.requestedModel,
      returnedModel: result.returnedModel,
      usage: result.usage,
      latencyMs: result.latencyMs,
      error: result.error || null,
      blocked402,
      preview: (result.content || "").slice(0, 200),
    },
    null,
    2,
  ),
);

if (blocked402 || !result.ok) {
  console.log("PREFLIGHT=BLOCKED");
  process.exit(3);
}
console.log("PREFLIGHT=OK");
