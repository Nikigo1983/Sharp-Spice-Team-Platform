export type AiProvider = "openrouter" | "openai";

export type AiRuntimeConfig = {
  provider: AiProvider;
  apiKey: string;
  completionsUrl: string;
  model: string;
};

/** OpenRouter first, then direct OpenAI. */
export function getAiRuntimeConfig(): AiRuntimeConfig | null {
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openRouterKey) {
    return {
      provider: "openrouter",
      apiKey: openRouterKey,
      completionsUrl: "https://openrouter.ai/api/v1/chat/completions",
      model:
        process.env.OPENROUTER_MODEL?.trim() || "openrouter/free",
    };
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    return {
      provider: "openai",
      apiKey: openaiKey,
      completionsUrl: "https://api.openai.com/v1/chat/completions",
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    };
  }

  return null;
}

export function isAiConfigured(): boolean {
  return getAiRuntimeConfig() !== null;
}

export function getAiSetupHint(): string {
  return "OPENROUTER_API_KEY (рекомендуется) или OPENAI_API_KEY в .env.local";
}
