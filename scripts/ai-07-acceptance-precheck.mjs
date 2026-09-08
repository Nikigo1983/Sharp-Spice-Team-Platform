/**
 * AI-07 final acceptance — OpenRouter availability precheck only.
 * Does not print secrets.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAiConfigured, getAiRuntimeConfig } from "../src/lib/ai/config.ts";
import { getWorkspaceAiConfig } from "../src/lib/ai/workspace-config.ts";
import { getWorkspaceRouterModel } from "../src/lib/ai/workspace-router.ts";
import { createChatCompletionResult } from "../src/lib/ai/openai.ts";

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

const configured = isAiConfigured();
const rt = getAiRuntimeConfig();
const ws = getWorkspaceAiConfig();
const router = getWorkspaceRouterModel() || null;

console.log(
  JSON.stringify(
    {
      configured,
      provider: rt?.provider || null,
      host: rt ? new URL(rt.completionsUrl).host : null,
      hasKey: Boolean((process.env.OPENROUTER_API_KEY || "").trim()),
      workspaceModel: ws.model || null,
      routerModelResolved: router,
    },
    null,
    2,
  ),
);

if (!configured) {
  console.log("PRECHECK=BLOCKED_NOT_CONFIGURED");
  process.exit(2);
}

const probe = await createChatCompletionResult(
  [{ role: "user", content: "Reply with exactly: OK" }],
  { temperature: 0, maxTokens: 8, model: ws.model || undefined },
);

const err = String(probe.error || "");
const blocked402 =
  /402|credits|afford|in_flight_budget/i.test(err) ||
  (!probe.ok && /402/.test(String(probe.error)));

console.log(
  JSON.stringify(
    {
      probeOk: probe.ok,
      probeContent: (probe.content || "").slice(0, 40),
      probeErrorClass: blocked402 ? "402_CREDITS" : probe.ok ? null : "OTHER",
      returnedModel: probe.returnedModel || null,
      errorSnippet: probe.ok
        ? null
        : err.replace(/sk-[a-zA-Z0-9]+/g, "[redacted]").slice(0, 200),
    },
    null,
    2,
  ),
);

if (blocked402) {
  console.log("PRECHECK=BLOCKED_CREDITS");
  process.exit(3);
}

if (!probe.ok) {
  console.log("PRECHECK=BLOCKED_OTHER");
  process.exit(4);
}

console.log("PRECHECK=AVAILABLE");
