import { getAiRuntimeConfig } from "@/lib/ai/config";
import { getOpenRouterDefaultModel, isGpt6AstraModel } from "@/lib/ai/models";
import {
  assertOpenRouterPayloadSafe,
  redactForLogging,
  redactSensitiveText,
  sanitizeChatMessagesForProvider,
} from "@/lib/ai/context-redaction";
import { fetchWithTlsFallback } from "@/lib/google-fetch";

export type ChatMessageRole = "system" | "user" | "assistant" | "tool";

export type ChatToolFunctionCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ChatMessage = {
  role: ChatMessageRole;
  content: string | null;
  tool_calls?: ChatToolFunctionCall[];
  tool_call_id?: string;
  name?: string;
};

export type ChatToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatToolChoice =
  | "auto"
  | "none"
  | { type: "function"; function: { name: string } };

export type ChatCompletionOptions = {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  tools?: ChatToolDefinition[];
  tool_choice?: ChatToolChoice;
};

export type ChatCompletionUsage = {
  inputTokens: number | "NOT_AVAILABLE";
  outputTokens: number | "NOT_AVAILABLE";
};

export type ChatCompletionResult = {
  content: string | null;
  ok: boolean;
  requestedModel: string;
  returnedModel: string | "NOT_AVAILABLE";
  usage: ChatCompletionUsage;
  latencyMs: number;
  error?: string;
  /** Present when the model requested tool calls instead of (or with) text. */
  toolCalls?: ChatToolFunctionCall[];
  finishReason?: string | null;
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
  return options?.model?.trim() || config.model || getOpenRouterDefaultModel();
}

function buildRequestBody(
  config: NonNullable<ReturnType<typeof getAiRuntimeConfig>>,
  messages: ChatMessage[],
  options: ChatCompletionOptions | undefined,
  stream: boolean,
): string {
  const safeMessages = sanitizeChatMessagesForProvider(messages);
  assertOpenRouterPayloadSafe(safeMessages);
  const model = resolveModel(config, options);

  const payload: Record<string, unknown> = {
    model,
    messages: safeMessages,
    stream,
  };

  // GPT-6 Astra via OpenRouter: max_tokens supported; temperature is not listed
  // in supported_parameters — omit to avoid rejecting/ignoring unsafe params.
  // Never send reasoning / include_reasoning (do not expose chain-of-thought).
  if (!isGpt6AstraModel(model)) {
    payload.temperature = options?.temperature ?? 0.35;
  }

  if (options?.maxTokens && options.maxTokens > 0) {
    payload.max_tokens = options.maxTokens;
  }

  if (options?.tools && options.tools.length > 0) {
    payload.tools = options.tools;
    if (options.tool_choice !== undefined) {
      payload.tool_choice = options.tool_choice;
    }
  }

  return JSON.stringify(payload);
}

function parseToolCalls(raw: unknown): ChatToolFunctionCall[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const parsed: ChatToolFunctionCall[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as {
      id?: string;
      type?: string;
      function?: { name?: string; arguments?: string };
    };
    const name = item.function?.name?.trim();
    if (!name) continue;
    parsed.push({
      id:
        typeof item.id === "string" && item.id.trim()
          ? item.id.trim()
          : `tool_${parsed.length}`,
      type: "function",
      function: {
        name,
        arguments:
          typeof item.function?.arguments === "string"
            ? item.function.arguments
            : "{}",
      },
    });
  }
  return parsed.length > 0 ? parsed : undefined;
}

function parseUsage(raw: unknown): ChatCompletionUsage {
  if (!raw || typeof raw !== "object") {
    return {
      inputTokens: "NOT_AVAILABLE",
      outputTokens: "NOT_AVAILABLE",
    };
  }
  const usage = raw as {
    prompt_tokens?: number;
    completion_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
  return {
    inputTokens:
      typeof usage.prompt_tokens === "number"
        ? usage.prompt_tokens
        : typeof usage.input_tokens === "number"
          ? usage.input_tokens
          : "NOT_AVAILABLE",
    outputTokens:
      typeof usage.completion_tokens === "number"
        ? usage.completion_tokens
        : typeof usage.output_tokens === "number"
          ? usage.output_tokens
          : "NOT_AVAILABLE",
  };
}

export async function createChatCompletionResult(
  messages: ChatMessage[],
  options?: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const config = getAiRuntimeConfig();
  const started = Date.now();
  if (!config) {
    return {
      content: null,
      ok: false,
      requestedModel: options?.model?.trim() || "NOT_CONFIGURED",
      returnedModel: "NOT_AVAILABLE",
      usage: {
        inputTokens: "NOT_AVAILABLE",
        outputTokens: "NOT_AVAILABLE",
      },
      latencyMs: Date.now() - started,
      error: "AI_NOT_CONFIGURED",
    };
  }

  const requestedModel = resolveModel(config, options);
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
          model?: string;
          usage?: unknown;
          choices?: {
            finish_reason?: string | null;
            message?: {
              content?: string | null;
              tool_calls?: unknown;
            };
          }[];
        };
        const message = data.choices?.[0]?.message;
        const toolCalls = parseToolCalls(message?.tool_calls);
        const rawContent = message?.content;
        const content =
          typeof rawContent === "string" && rawContent.trim()
            ? rawContent.trim()
            : null;
        const ok = Boolean(content) || Boolean(toolCalls?.length);
        return {
          content,
          ok,
          requestedModel,
          returnedModel:
            typeof data.model === "string" && data.model.trim()
              ? data.model.trim()
              : "NOT_AVAILABLE",
          usage: parseUsage(data.usage),
          latencyMs: Date.now() - started,
          error: ok ? undefined : "MODEL_EMPTY_RESPONSE",
          toolCalls,
          finishReason: data.choices?.[0]?.finish_reason ?? null,
        };
      }

      const errBody = await response.text();
      console.error(
        `[ai/${config.provider}] error`,
        response.status,
        redactSensitiveText(errBody),
      );

      if (response.status === 429 && attempt < maxAttempts) {
        const waitMs = parseRetryAfterMs(response, errBody);
        console.warn(
          `[ai/${config.provider}] rate limited, retry ${attempt}/${maxAttempts} in ${waitMs}ms`,
        );
        await sleep(waitMs);
        continue;
      }

      return {
        content: null,
        ok: false,
        requestedModel,
        returnedModel: "NOT_AVAILABLE",
        usage: {
          inputTokens: "NOT_AVAILABLE",
          outputTokens: "NOT_AVAILABLE",
        },
        latencyMs: Date.now() - started,
        error: `OPENROUTER_HTTP_${response.status}`,
      };
    } catch (error) {
      console.error(`[ai/${config.provider}] request failed`, redactForLogging(error));
      if (attempt < maxAttempts) {
        await sleep(2000);
        continue;
      }
      return {
        content: null,
        ok: false,
        requestedModel,
        returnedModel: "NOT_AVAILABLE",
        usage: {
          inputTokens: "NOT_AVAILABLE",
          outputTokens: "NOT_AVAILABLE",
        },
        latencyMs: Date.now() - started,
        error: "OPENROUTER_REQUEST_FAILED",
      };
    }
  }

  return {
    content: null,
    ok: false,
    requestedModel,
    returnedModel: "NOT_AVAILABLE",
    usage: {
      inputTokens: "NOT_AVAILABLE",
      outputTokens: "NOT_AVAILABLE",
    },
    latencyMs: Date.now() - started,
    error: "OPENROUTER_ERROR",
  };
}

export async function createChatCompletion(
  messages: ChatMessage[],
  options?: ChatCompletionOptions,
): Promise<string | null> {
  const result = await createChatCompletionResult(messages, options);
  return result.content;
}

function extractStreamDelta(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";

  const data = payload as {
    choices?: { delta?: { content?: string }; message?: { content?: string } }[];
  };

  const choice = data.choices?.[0];
  return choice?.delta?.content ?? choice?.message?.content ?? "";
}

export type StreamChatCompletionEvent =
  | { type: "delta"; content: string }
  | { type: "meta"; result: ChatCompletionResult };

export async function* streamChatCompletionResult(
  messages: ChatMessage[],
  options?: ChatCompletionOptions,
): AsyncGenerator<StreamChatCompletionEvent> {
  const config = getAiRuntimeConfig();
  const started = Date.now();
  if (!config) {
    yield {
      type: "meta",
      result: {
        content: null,
        ok: false,
        requestedModel: options?.model?.trim() || "NOT_CONFIGURED",
        returnedModel: "NOT_AVAILABLE",
        usage: {
          inputTokens: "NOT_AVAILABLE",
          outputTokens: "NOT_AVAILABLE",
        },
        latencyMs: Date.now() - started,
        error: "AI_NOT_CONFIGURED",
      },
    };
    return;
  }

  const requestedModel = resolveModel(config, options);
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
      redactSensitiveText(errBody),
    );
    yield {
      type: "meta",
      result: {
        content: null,
        ok: false,
        requestedModel,
        returnedModel: "NOT_AVAILABLE",
        usage: {
          inputTokens: "NOT_AVAILABLE",
          outputTokens: "NOT_AVAILABLE",
        },
        latencyMs: Date.now() - started,
        error: `OPENROUTER_HTTP_${response.status}`,
      },
    };
    return;
  }

  const { StreamToolCallAccumulator } = await import(
    "@/lib/ai/workspace-tools/stream-tool-calls"
  );
  const toolAccumulator = new StreamToolCallAccumulator();
  const suppressContentDeltas = Boolean(options?.tools?.length);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assembled = "";
  let returnedModel: string | "NOT_AVAILABLE" = "NOT_AVAILABLE";
  let usage: ChatCompletionUsage = {
    inputTokens: "NOT_AVAILABLE",
    outputTokens: "NOT_AVAILABLE",
  };
  let finishReason: string | null = null;

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
        const parsed = JSON.parse(data) as {
          model?: string;
          usage?: unknown;
          choices?: { finish_reason?: string | null }[];
        };
        if (typeof parsed.model === "string" && parsed.model.trim()) {
          returnedModel = parsed.model.trim();
        }
        if (parsed.usage) {
          usage = parseUsage(parsed.usage);
        }
        const fr = parsed.choices?.[0]?.finish_reason;
        if (typeof fr === "string") {
          finishReason = fr;
        }
        toolAccumulator.ingestDelta(parsed);
        const delta = extractStreamDelta(parsed);
        if (delta) {
          assembled += delta;
          if (!suppressContentDeltas) {
            yield { type: "delta", content: delta };
          }
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }

  const toolCalls = toolAccumulator.finalize();
  const content = assembled.trim() ? assembled : null;
  const ok = Boolean(content) || toolCalls.length > 0;

  yield {
    type: "meta",
    result: {
      content,
      ok,
      requestedModel,
      returnedModel,
      usage,
      latencyMs: Date.now() - started,
      error: ok ? undefined : "MODEL_EMPTY_RESPONSE",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
    },
  };
}

export async function* streamChatCompletion(
  messages: ChatMessage[],
  options?: ChatCompletionOptions,
): AsyncGenerator<string> {
  for await (const event of streamChatCompletionResult(messages, options)) {
    if (event.type === "delta") yield event.content;
  }
}
