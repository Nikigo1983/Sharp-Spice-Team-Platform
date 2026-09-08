/**
 * Sharp & Spice production LLM model IDs (OpenRouter).
 * Each workload resolves its model explicitly — no accidental Claude/mini fallback.
 */

/** Intended production model for all Sharp & Spice LLM workloads. */
export const GPT6_ASTRA_MODEL_ID = "openai/gpt-6-astra";

export function isGpt6AstraModel(model: string | null | undefined): boolean {
  if (!model) return false;
  return model.trim().toLowerCase().includes("gpt-6-astra");
}

/** Final AI Workspace answer generation. */
export function getWorkspaceFinalModel(): string {
  return process.env.AI_WORKSPACE_MODEL?.trim() || GPT6_ASTRA_MODEL_ID;
}

/** Ambiguous-query AI router classifier. */
export function getWorkspaceRouterModelId(): string {
  return process.env.AI_WORKSPACE_ROUTER_MODEL?.trim() || GPT6_ASTRA_MODEL_ID;
}

/**
 * Default OpenRouter / auxiliary model (client search intent, client card AI, etc.).
 * Env OPENROUTER_MODEL overrides; otherwise Astra.
 */
export function getOpenRouterDefaultModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || GPT6_ASTRA_MODEL_ID;
}

/** Explicit model for non-workspace auxiliary LLM calls. */
export function getAuxiliaryLlmModel(): string {
  return getOpenRouterDefaultModel();
}
