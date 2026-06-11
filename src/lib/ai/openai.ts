import { getAiRuntimeConfig } from "@/lib/ai/config";
import { fetchWithTlsFallback } from "@/lib/google-fetch";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionOptions = {
  temperature?: number;
  maxTokens?: number;
  model?: string;
};

export { getAiRuntimeConfig, isAiConfigured, getAiSetupHint } from "@/lib/ai/config";

function parseRetryAfterMs(response: Response, errBody: string): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 30_000);
    }
  }

  try {
    const data = JSON.parse(errBody) as {
      error?: { metadata?: { retryAfter?: number; retry_after?: number } };
    };
    const retry =
      data.error?.metadata?.retryAfter ?? data.error?.metadata?.retry_after;
    if (typeof retry === "number" && retry > 0) {
      return Math.min(retry * 1000, 30_000);
    }
  } catch {
    // ignore
  }

  return 5000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRequestHeaders(
  config: NonNullable<ReturnType<typeof getAiRuntimeConfig>>,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };

  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] =
      process.env.OPENROUTER_HTTP_REFERER?.trim() ||
      "http://localhost:3000";
    headers["X-OpenRouter-Title"] =
      process.env.OPENROUTER_APP_TITLE?.trim() ||
      "Sharp & Spice Team Platform";
  }

  return headers;
}

function resolveModel(
  config: NonNullable<ReturnType<typeof getAiRuntimeConfig>>,
  options?: ChatCompletionOptions,
): string {
  return options?.model?.trim() || config.model;
}

function buildRequestBody(
  config: NonNullable<ReturnType<typeof getAiRuntimeConfig>>,
  messages: ChatMessage[],
  options: ChatCompletionOptions | undefined,
  stream: boolean,
): string {
  const payload: Record<string, unknown> = {
    model: resolveModel(config, options),
    temperature: options?.temperature ?? 0.35,
    messages,
    stream,
  };

  if (options?.maxTokens && options.maxTokens > 0) {
    payload.max_tokens = options.maxTokens;
  }

  return JSON.stringify(payload);
}

export async function createChatCompletion(
  messages: ChatMessage[],
  options?: ChatCompletionOptions,
): Promise<string | null> {
  const config = getAiRuntimeConfig();
  if (!config) return null;

  const headers = buildRequestHeaders(config);
  const body = buildRequestBody(config, messages, options, false);
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetchWithTlsFallback(config.completionsUrl, {
        method: "POST",
        headers,
        body,
      });

      if (response.ok) {
        const data = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        return data.choices?.[0]?.message?.content?.trim() ?? null;
      }

      const errBody = await response.text();
      console.error(
        `[ai/${config.provider}] error`,
        response.status,
        errBody,
      );

      if (response.status === 429 && attempt < maxAttempts) {
        const waitMs = parseRetryAfterMs(response, errBody);
        console.warn(
          `[ai/${config.provider}] rate limited, retry ${attempt}/${maxAttempts} in ${waitMs}ms`,
        );
        await sleep(waitMs);
        continue;
      }

      return null;
    } catch (error) {
      console.error(`[ai/${config.provider}] request failed`, error);
      if (attempt < maxAttempts) {
        await sleep(2000);
        continue;
      }
      return null;
    }
  }

  return null;
}

function extractStreamDelta(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";

  const data = payload as {
    choices?: { delta?: { content?: string }; message?: { content?: string } }[];
  };

  const choice = data.choices?.[0];
  return choice?.delta?.content ?? choice?.message?.content ?? "";
}

export async function* streamChatCompletion(
  messages: ChatMessage[],
  options?: ChatCompletionOptions,
): AsyncGenerator<string> {
  const config = getAiRuntimeConfig();
  if (!config) return;

  const headers = buildRequestHeaders(config);
  const body = buildRequestBody(config, messages, options, true);

  const response = await fetchWithTlsFallback(config.completionsUrl, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok || !response.body) {
    const errBody = await response.text();
    console.error(
      `[ai/${config.provider}] stream error`,
      response.status,
      errBody,
    );
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      try {
        const delta = extractStreamDelta(JSON.parse(data));
        if (delta) yield delta;
      } catch {
        // ignore malformed chunks
      }
    }
  }
}
