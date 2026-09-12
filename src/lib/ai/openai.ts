import { getAiRuntimeConfig } from "@/lib/ai/config";
import { isGpt6AstraModel, normalizeProviderModel } from "@/lib/ai/models";
import { AiCompletionError, aiErrorCode } from "@/lib/ai/errors";
import { createAiDeadline, currentAiSignal } from "@/lib/ai/request-scope";
import { setTimeout as delay } from "node:timers/promises";
import {
  assertOpenRouterPayloadSafe,
  sanitizeChatMessagesForProvider,
} from "@/lib/ai/context-redaction";


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
  signal?: AbortSignal;
  timeoutMs?: number;
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
    const retryAt = Date.parse(header);
    if (Number.isFinite(retryAt)) return Math.max(0, Math.min(retryAt - Date.now(), 30_000));
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
  return normalizeProviderModel(config.provider, options?.model?.trim() || config.model);
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
  if (!isGpt6AstraModel(model) && !/^(o[1-9]|gpt-[5-9])/.test(model)) {
    payload.temperature = options?.temperature ?? 0.35;
  }

  if (options?.maxTokens && options.maxTokens > 0) {
    payload[config.provider === "openai" ? "max_completion_tokens" : "max_tokens"] = options.maxTokens;
  }

  if (options?.tools && options.tools.length > 0) {
    payload.tools = options.tools;
    if (options.tool_choice !== undefined) {
      payload.tool_choice = options.tool_choice;
    }
  }

  if (stream) payload.stream_options = { include_usage: true };
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


function failure(started: number, requestedModel: string, code: string): ChatCompletionResult {
  return { content: null, ok: false, requestedModel, returnedModel: "NOT_AVAILABLE",
    usage: parseUsage(null), latencyMs: Date.now() - started, error: code };
}

function finishError(reason: string | null, hasContent: boolean, hasTools: boolean): string | undefined {
  if (reason === "length") return "MODEL_LENGTH_LIMIT";
  if (reason === "content_filter") return "MODEL_CONTENT_FILTER";
  if (reason !== "stop" && reason !== "tool_calls") return "MODEL_STREAM_INTERRUPTED";
  if (reason === "tool_calls" && !hasTools) return "MODEL_INVALID_RESPONSE";
  if (!hasContent && !hasTools) return "MODEL_EMPTY_RESPONSE";
}

function requestDeadline(options?: ChatCompletionOptions) {
  const parents = [options?.signal, currentAiSignal()].filter((s): s is AbortSignal => Boolean(s));
  return createAiDeadline(parents.length ? AbortSignal.any(parents) : undefined, options?.timeoutMs);
}

function requestError(error: unknown, signal: AbortSignal): string {
  return aiErrorCode(signal.aborted ? signal.reason : error);
}

async function postCompletion(config: NonNullable<ReturnType<typeof getAiRuntimeConfig>>, body: string, signal: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    // Native fetch validates certificates and returns as soon as headers arrive.
    // Never retry a transport failure: the provider may already have billed it.
    const response = await fetch(config.completionsUrl, {
      method: "POST", headers: buildRequestHeaders(config), body, signal,
      cache: "no-store", redirect: "error",
    });
    if (response.ok) return response;
    const errBody = await response.text();
    console.error(`[ai/${config.provider}] HTTP ${response.status}`);
    if (attempt === 0 && [429, 502, 503, 504].includes(response.status)) {
      await delay(parseRetryAfterMs(response, errBody), undefined, { signal });
      continue;
    }
    throw new AiCompletionError(`${config.provider.toUpperCase()}_HTTP_${response.status}`);
  }
}

export async function createChatCompletionResult(messages: ChatMessage[], options?: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const started = Date.now();
  const deadline = requestDeadline(options);
  let requestedModel = options?.model ?? "NOT_CONFIGURED";
  try {
    deadline.signal.throwIfAborted();
    const config = getAiRuntimeConfig();
    if (!config) return failure(started, requestedModel, "AI_NOT_CONFIGURED");
    requestedModel = resolveModel(config, options);
    const response = await postCompletion(config, buildRequestBody(config, messages, options, false), deadline.signal);
    const data = await response.json() as {
      model?: string; usage?: unknown; error?: unknown;
      choices?: { finish_reason?: string; message?: { content?: string; tool_calls?: unknown; refusal?: string } }[];
    };
    if (data.error || !Array.isArray(data.choices)) throw new AiCompletionError("MODEL_INVALID_RESPONSE");
    const choice = data.choices[0];
    const content = typeof choice?.message?.content === "string" ? choice.message.content.trim() || null : null;
    const toolCalls = parseToolCalls(choice?.message?.tool_calls);
    const finishReason = choice?.finish_reason ?? null;
    const error = choice?.message?.refusal ? "MODEL_CONTENT_FILTER" : finishError(finishReason, Boolean(content), Boolean(toolCalls?.length));
    return { content, ok: !error, requestedModel, returnedModel: data.model || "NOT_AVAILABLE",
      usage: parseUsage(data.usage), latencyMs: Date.now() - started, error,
      // An incomplete function call must never be executed.
      toolCalls: error ? undefined : toolCalls, finishReason };
  } catch (error) {
    return failure(started, requestedModel, requestError(error, deadline.signal));
  } finally { deadline.dispose(); }
}

export async function createChatCompletion(messages: ChatMessage[], options?: ChatCompletionOptions): Promise<string | null> {
  const result = await createChatCompletionResult(messages, options);
  return result.ok ? result.content : null;
}

export type StreamChatCompletionEvent =
  | { type: "delta"; content: string }
  | { type: "meta"; result: ChatCompletionResult };

/** SSE framing independent of network chunk boundaries, including CRLF and EOF. */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lines: string[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 1_000_000) throw new AiCompletionError("MODEL_INVALID_RESPONSE");
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (!line) {
          if (lines.length) { yield lines.join("\n"); lines = []; }
        } else if (line.startsWith("data:")) {
          lines.push(line.slice(5).replace(/^ /, ""));
        }
      }
      if (done) {
        if (buffer.startsWith("data:")) lines.push(buffer.slice(5).trimStart());
        if (lines.length) yield lines.join("\n");
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function* streamChatCompletionResult(messages: ChatMessage[], options?: ChatCompletionOptions): AsyncGenerator<StreamChatCompletionEvent> {
  const started = Date.now();
  const deadline = requestDeadline(options);
  let requestedModel = options?.model ?? "NOT_CONFIGURED";
  let assembled = "";
  let returnedModel = "NOT_AVAILABLE";
  let usage = parseUsage(null);
  let finishReason: string | null = null;
  try {
    deadline.signal.throwIfAborted();
    const config = getAiRuntimeConfig();
    if (!config) throw new AiCompletionError("AI_NOT_CONFIGURED");
    requestedModel = resolveModel(config, options);
    const response = await postCompletion(config, buildRequestBody(config, messages, options, true), deadline.signal);
    if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new AiCompletionError("MODEL_INVALID_RESPONSE");
    const { StreamToolCallAccumulator } = await import("@/lib/ai/workspace-tools/stream-tool-calls");
    const accumulator = new StreamToolCallAccumulator();
    let ended = false;
    for await (const data of sseData(response.body)) {
      deadline.signal.throwIfAborted();
      if (data.trim() === "[DONE]") { ended = true; break; }
      let parsed: {
        model?: string; usage?: unknown; error?: unknown;
        choices?: { finish_reason?: string; delta?: { content?: string; refusal?: string } }[];
      };
      try { parsed = JSON.parse(data); } catch { throw new AiCompletionError("MODEL_INVALID_RESPONSE"); }
      if (!parsed || parsed.error) throw new AiCompletionError("MODEL_INVALID_RESPONSE");
      if (parsed.model) returnedModel = parsed.model;
      if (parsed.usage) usage = parseUsage(parsed.usage);
      const choice = parsed.choices?.[0];
      if (choice?.delta?.refusal) throw new AiCompletionError("MODEL_CONTENT_FILTER");
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      accumulator.ingestDelta(parsed);
      const delta = choice?.delta?.content;
      if (typeof delta === "string" && delta) {
        assembled += delta;
        // Tool rounds can contain intermediate text; only expose their final answer.
        if (!options?.tools?.length) yield { type: "delta", content: delta };
      }
    }
    const toolCalls = accumulator.finalize();
    const error = !ended ? "MODEL_STREAM_INTERRUPTED" : finishError(finishReason, Boolean(assembled.trim()), toolCalls.length > 0);
    yield { type: "meta", result: {
      content: assembled.trim() ? assembled : null, ok: !error, requestedModel, returnedModel, usage,
      latencyMs: Date.now() - started, error, finishReason,
      toolCalls: error || !toolCalls.length ? undefined : toolCalls,
    }};
  } catch (error) {
    yield { type: "meta", result: {
      ...failure(started, requestedModel, requestError(error, deadline.signal)),
      content: assembled || null, returnedModel, usage, finishReason,
    }};
  } finally { deadline.dispose(); }
}

export async function* streamChatCompletion(messages: ChatMessage[], options?: ChatCompletionOptions): AsyncGenerator<string> {
  for await (const event of streamChatCompletionResult(messages, options)) {
    if (event.type === "delta") yield event.content;
    else if (!event.result.ok) throw new AiCompletionError(event.result.error);
  }
}
