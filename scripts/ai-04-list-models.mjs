/**
 * AI-04 helper: list OpenRouter model IDs relevant to router benchmark.
 * Does not print API keys.
 */
import { existsSync, readFileSync } from "node:fs";

function loadEnvLocal() {
  const path = ".env.local";
  if (!existsSync(path)) return {};
  const env = {};
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
    env[k] = v;
  }
  return env;
}

const env = loadEnvLocal();
const key = (env.OPENROUTER_API_KEY || "").trim();
if (!key) {
  console.error("NO_OPENROUTER_KEY");
  process.exit(1);
}

const res = await fetch("https://openrouter.ai/api/v1/models", {
  headers: {
    Authorization: `Bearer ${key}`,
  },
});

if (!res.ok) {
  console.error("MODELS_HTTP_" + res.status);
  process.exit(1);
}

const data = await res.json();
const models = Array.isArray(data.data) ? data.data : [];

const interesting = models
  .map((m) => ({
    id: m.id,
    name: m.name,
    pricing: m.pricing
      ? {
          prompt: m.pricing.prompt,
          completion: m.pricing.completion,
        }
      : null,
    context: m.context_length,
  }))
  .filter((m) => {
    const id = String(m.id).toLowerCase();
    return (
      id.includes("gpt-4o") ||
      id.includes("gpt-4.1") ||
      id.includes("gpt-5") ||
      id.includes("gpt-6") ||
      id.includes("astra") ||
      id.includes("o4-mini") ||
      id.includes("o3-mini") ||
      id === "openai/gpt-4o-mini" ||
      id.includes("claude-sonnet") ||
      id.includes("gemini-2.5-flash") ||
      id.includes("gemini-flash")
    );
  })
  .sort((a, b) => a.id.localeCompare(b.id));

const gpt6 = models.filter((m) =>
  /gpt-6|astra/i.test(String(m.id) + " " + String(m.name || "")),
);

console.log(
  JSON.stringify(
    {
      totalModels: models.length,
      gpt6OrAstraCount: gpt6.length,
      gpt6OrAstraIds: gpt6.map((m) => m.id),
      interesting,
    },
    null,
    2,
  ),
);
