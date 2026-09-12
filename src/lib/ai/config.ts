import { getOpenRouterDefaultModel, getSelectedAiProvider } from "@/lib/ai/models";
export type AiProvider = "openrouter" | "openai";
export type AiRuntimeConfig = { provider: AiProvider; apiKey: string; completionsUrl: string; model: string };

/** AI_PROVIDER is explicit; absent preserves the existing OpenRouter-first setup. */
export function getAiRuntimeConfig(): AiRuntimeConfig | null {
  const provider = getSelectedAiProvider();
  const apiKey = (provider === "openai" ? process.env.OPENAI_API_KEY : process.env.OPENROUTER_API_KEY)?.trim();
  if (!apiKey) return null;
  return {
    provider, apiKey,
    completionsUrl: provider === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions",
    model: provider === "openai" ? process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini" : getOpenRouterDefaultModel(),
  };
}
export function isAiConfigured(): boolean {
  try { return getAiRuntimeConfig() !== null; } catch { return false; }
}
export function getAiSetupHint(): string {
  return "AI_PROVIDER=openrouter и OPENROUTER_API_KEY либо AI_PROVIDER=openai и OPENAI_API_KEY";
}
