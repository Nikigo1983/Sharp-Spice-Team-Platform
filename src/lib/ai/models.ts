import { AiCompletionError } from "@/lib/ai/errors";
export const GPT6_ASTRA_MODEL_ID = "openai/gpt-6-astra";
export function isGpt6AstraModel(model: string | null | undefined): boolean {
  return Boolean(model?.trim().toLowerCase().includes("gpt-6-astra"));
}
export function getSelectedAiProvider(): "openai" | "openrouter" {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (provider && provider !== "openai" && provider !== "openrouter") throw new AiCompletionError("AI_INVALID_CONFIG");
  if (provider === "openai" || provider === "openrouter") return provider;
  if (process.env.OPENROUTER_API_KEY?.trim()) return "openrouter";
  return process.env.OPENAI_API_KEY?.trim() ? "openai" : "openrouter";
}
export function getOpenRouterDefaultModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || GPT6_ASTRA_MODEL_ID;
}
function workloadModel(override?: string, routerDefault = GPT6_ASTRA_MODEL_ID): string {
  if (getSelectedAiProvider() === "openai") {
    return normalizeProviderModel("openai", override?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini");
  }
  return override?.trim() || routerDefault;
}
export function normalizeProviderModel(provider: "openai" | "openrouter", model: string): string {
  if (provider === "openrouter") return model;
  const direct = model.startsWith("openai/") ? model.slice("openai/".length) : model;
  if (!direct || direct.includes("/")) throw new AiCompletionError("AI_INVALID_CONFIG");
  return direct;
}
export function getWorkspaceFinalModel(): string { return workloadModel(process.env.AI_WORKSPACE_MODEL); }
export function getWorkspaceRouterModelId(): string { return workloadModel(process.env.AI_WORKSPACE_ROUTER_MODEL); }
export function getAuxiliaryLlmModel(): string { return workloadModel(undefined, getOpenRouterDefaultModel()); }
