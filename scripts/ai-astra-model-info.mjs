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

const key = process.env.OPENROUTER_API_KEY?.trim();
if (!key) {
  console.log(JSON.stringify({ error: "NO_KEY" }));
  process.exit(2);
}

const res = await fetch("https://openrouter.ai/api/v1/models", {
  headers: { Authorization: `Bearer ${key}` },
});
const data = await res.json();
const hit = (data.data || []).find(
  (m) => m.id === "openai/gpt-6-astra" || String(m.id || "").includes("gpt-6-astra"),
);
if (!hit) {
  const related = (data.data || [])
    .filter(
      (m) =>
        String(m.id || "").includes("astra") ||
        String(m.id || "").includes("gpt-6"),
    )
    .slice(0, 30)
    .map((m) => ({ id: m.id, pricing: m.pricing }));
  console.log(JSON.stringify({ found: false, related }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      found: true,
      id: hit.id,
      name: hit.name,
      pricing: hit.pricing,
      architecture: hit.architecture,
      supported_parameters: hit.supported_parameters,
      context_length: hit.context_length,
    },
    null,
    2,
  ),
);
