import { existsSync, readFileSync } from "node:fs";

function loadEnvLocal() {
  const path = ".env.local";
  if (!existsSync(path)) return null;
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
if (!env) {
  console.log(JSON.stringify({ exists: false }));
  process.exit(0);
}

console.log(
  JSON.stringify(
    {
      exists: true,
      hasOpenRouterKey: Boolean((env.OPENROUTER_API_KEY || "").trim()),
      openrouterModel: env.OPENROUTER_MODEL || null,
      routerModel: (env.AI_WORKSPACE_ROUTER_MODEL || "").trim() || null,
      workspaceModel: env.AI_WORKSPACE_MODEL || null,
    },
    null,
    2,
  ),
);
