import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

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

const { createChatCompletionResult, streamChatCompletionResult } = await import(
  "../src/lib/ai/openai.ts"
);

const r = await createChatCompletionResult(
  [{ role: "user", content: "Reply with exactly: ASTRA_OK" }],
  { maxTokens: 16, model: "openai/gpt-6-astra" },
);

console.log(
  JSON.stringify(
    {
      nonStream: {
        ok: r.ok,
        requested: r.requestedModel,
        returned: r.returnedModel,
        content: r.content,
        error: r.error,
        usage: r.usage,
      },
    },
    null,
    2,
  ),
);

if (!r.ok) {
  console.log("MINIMAL_PROBE=BLOCKED_CREDITS_OR_ERROR");
  process.exit(3);
}

let assembled = "";
let first = null;
const t0 = Date.now();
let meta = null;
for await (const ev of streamChatCompletionResult(
  [{ role: "user", content: "Say hi in one word." }],
  { maxTokens: 16, model: "openai/gpt-6-astra" },
)) {
  if (ev.type === "delta") {
    if (first == null) first = Date.now() - t0;
    assembled += ev.content;
  } else {
    meta = ev.result;
  }
}

const out = {
  stream: {
    ok: Boolean(assembled.trim()),
    firstTokenMs: first,
    requested: meta?.requestedModel,
    returned: meta?.returnedModel,
    assembled,
    usage: meta?.usage,
  },
};
console.log(JSON.stringify(out, null, 2));

mkdirSync(resolve("scripts/ai-astra-results"), { recursive: true });
writeFileSync(
  resolve("scripts/ai-astra-results/minimal-probe.json"),
  JSON.stringify({ nonStream: r, ...out }, null, 2),
);
console.log("MINIMAL_PROBE=OK");
