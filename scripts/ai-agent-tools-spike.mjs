/**
 * Live OpenRouter + GPT-6 Astra tool-calling protocol validation.
 * Loads .env.local into process.env (never prints secrets).
 * Uses a synthetic local tool only — no CRM / Drive / PII.
 *
 * Usage:
 * node --experimental-strip-types --import ./scripts/test-register.mjs scripts/ai-agent-tools-spike.mjs
 */
import fs from "node:fs";
import path from "node:path";
import {
  createChatCompletionResult,
  streamChatCompletionResult,
} from "../src/lib/ai/openai.ts";
import { StreamToolCallAccumulator } from "../src/lib/ai/workspace-tools/stream-tool-calls.ts";
import { isAiConfigured } from "../src/lib/ai/config.ts";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const i = s.indexOf("=");
    if (i < 0) continue;
    const key = s.slice(0, i).trim();
    let value = s.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env) || !process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const MODEL = "openai/gpt-6-astra";
const MAX_TOKENS = 180;

const SYNTHETIC_TOOL = {
  type: "function",
  function: {
    name: "get_test_value",
    description:
      "Return a synthetic test account status. Always call this for test status questions.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["account"],
      properties: {
        account: {
          type: "string",
          minLength: 1,
          maxLength: 40,
          description: "Synthetic account label, e.g. demo",
        },
      },
    },
  },
};

function executeSyntheticTool(argsRaw) {
  let args;
  try {
    args =
      typeof argsRaw === "string" ? JSON.parse(argsRaw || "{}") : argsRaw;
  } catch {
    return {
      ok: false,
      error: "INVALID_JSON",
      argumentsType: typeof argsRaw,
    };
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { ok: false, error: "INVALID_ARGS_SHAPE" };
  }
  if ("userId" in args || "role" in args) {
    return { ok: false, error: "FORBIDDEN_AUTH_FIELDS" };
  }
  const keys = Object.keys(args);
  if (keys.some((k) => k !== "account")) {
    return { ok: false, error: "UNKNOWN_FIELDS", keys };
  }
  if (typeof args.account !== "string" || !args.account.trim()) {
    return { ok: false, error: "INVALID_ACCOUNT" };
  }
  return {
    ok: true,
    account: args.account.trim().slice(0, 40),
    status: "ACTIVE",
  };
}

function sanitizeToolCall(call) {
  if (!call) return null;
  return {
    id: call.id,
    type: call.type,
    function: {
      name: call.function?.name,
      argumentsType: typeof call.function?.arguments,
      argumentsPreview:
        typeof call.function?.arguments === "string"
          ? call.function.arguments.slice(0, 120)
          : call.function?.arguments,
    },
  };
}

async function runNonStreamLoop() {
  const messages = [
    {
      role: "system",
      content:
        "You are a protocol probe. For test-account status questions you MUST call get_test_value exactly once, then answer briefly from the tool result. Never invent status. Do not expose chain-of-thought.",
    },
    {
      role: "user",
      content: "What is the test account status for account demo? Use the available tool.",
    },
  ];

  const first = await createChatCompletionResult(messages, {
    model: MODEL,
    maxTokens: MAX_TOKENS,
    tools: [SYNTHETIC_TOOL],
    tool_choice: "auto",
  });

  const evidence = {
    requestedModel: first.requestedModel,
    returnedModel: first.returnedModel,
    ok: first.ok,
    finishReason: first.finishReason ?? null,
    hasContent: Boolean(first.content),
    contentPreview: first.content ? first.content.slice(0, 80) : null,
    toolCallsCount: first.toolCalls?.length ?? 0,
    toolCalls: (first.toolCalls ?? []).map(sanitizeToolCall),
    usage: first.usage,
    latencyMs: first.latencyMs,
    error: first.error ?? null,
  };

  if (!first.toolCalls?.length) {
    return {
      pass: false,
      reason: "NO_TOOL_CALL_IN_FIRST_ROUND",
      evidence,
      second: null,
    };
  }

  const call = first.toolCalls[0];
  const toolData = executeSyntheticTool(call.function.arguments);
  const argsFormat = typeof call.function.arguments;

  messages.push({
    role: "assistant",
    content: first.content,
    tool_calls: first.toolCalls,
  });
  messages.push({
    role: "tool",
    tool_call_id: call.id,
    name: call.function.name,
    content: JSON.stringify(toolData),
  });

  const second = await createChatCompletionResult(messages, {
    model: MODEL,
    maxTokens: MAX_TOKENS,
    tools: [SYNTHETIC_TOOL],
    tool_choice: "auto",
  });

  const secondEvidence = {
    requestedModel: second.requestedModel,
    returnedModel: second.returnedModel,
    ok: second.ok,
    finishReason: second.finishReason ?? null,
    hasContent: Boolean(second.content),
    contentPreview: second.content ? second.content.slice(0, 160) : null,
    toolCallsCount: second.toolCalls?.length ?? 0,
    usage: second.usage,
    latencyMs: second.latencyMs,
    error: second.error ?? null,
  };

  const mentionsActive = /ACTIVE/i.test(second.content ?? "");
  const unnecessaryRecall =
    (second.toolCalls?.length ?? 0) > 0 &&
    second.toolCalls.some((c) => c.function.name === "get_test_value");

  const pass =
    toolData.ok &&
    Boolean(second.content) &&
    mentionsActive &&
    !unnecessaryRecall &&
    argsFormat === "string";

  return {
    pass,
    reason: pass
      ? "OK"
      : !toolData.ok
        ? `TOOL_EXEC_${toolData.error}`
        : !second.content
          ? "SECOND_ROUND_NO_CONTENT"
          : !mentionsActive
            ? "SECOND_ROUND_MISSING_ACTIVE"
            : unnecessaryRecall
              ? "SECOND_ROUND_RECALLED_TOOL"
              : argsFormat !== "string"
                ? `ARGS_FORMAT_${argsFormat}`
                : "UNKNOWN",
    evidence,
    argsFormat,
    toolCallId: call.id,
    toolResult: toolData,
    second: secondEvidence,
  };
}

async function runStreamLoop() {
  const messages = [
    {
      role: "system",
      content:
        "You are a protocol probe. For test-account status questions you MUST call get_test_value exactly once, then answer briefly from the tool result. Never invent status. Do not expose chain-of-thought.",
    },
    {
      role: "user",
      content: "What is the test account status for account demo? Use the available tool.",
    },
  ];

  const accumulator = new StreamToolCallAccumulator();
  const rawDeltas = await captureRawToolStreamDeltas(messages);

  let finishReason = null;
  let usage = null;
  let returnedModel = null;
  let contentAlongsideTools = false;
  let assembledContent = "";

  for (const payload of rawDeltas.payloads) {
    accumulator.ingestDelta(payload);
    const choice = payload.choices?.[0];
    if (typeof choice?.finish_reason === "string") {
      finishReason = choice.finish_reason;
    }
    if (payload.model) returnedModel = payload.model;
    if (payload.usage) {
      usage = {
        inputTokens: payload.usage.prompt_tokens ?? "NOT_AVAILABLE",
        outputTokens: payload.usage.completion_tokens ?? "NOT_AVAILABLE",
      };
    }
    const delta = choice?.delta;
    if (delta?.content) {
      assembledContent += delta.content;
      if (Array.isArray(delta.tool_calls) && delta.tool_calls.length) {
        contentAlongsideTools = true;
      }
    }
  }

  const reconstructed = accumulator.finalize();

  const streamEvidence = {
    returnedModel: returnedModel ?? "NOT_AVAILABLE",
    finishReason,
    usage,
    contentAlongsideTools,
    contentPreview: assembledContent ? assembledContent.slice(0, 80) : null,
    rawToolDeltaEvents: rawDeltas.summary,
    reconstructed: reconstructed.map(sanitizeToolCall),
    rawError: rawDeltas.summary.find((s) => s.error)?.error ?? null,
  };

  if (reconstructed.length === 0) {
    return {
      pass: false,
      reason: "NO_TOOL_CALLS_IN_STREAM",
      streamEvidence,
      second: null,
      executions: 0,
    };
  }

  const call = reconstructed[0];
  const toolData = executeSyntheticTool(call.function.arguments);
  const executions = 1;

  messages.push({
    role: "assistant",
    content: assembledContent.trim() ? assembledContent : null,
    tool_calls: reconstructed,
  });
  messages.push({
    role: "tool",
    tool_call_id: call.id,
    name: call.function.name,
    content: JSON.stringify(toolData),
  });

  let finalText = "";
  let secondMeta = null;
  let leakedToolJsonCount = 0;
  for await (const event of streamChatCompletionResult(messages, {
    model: MODEL,
    maxTokens: MAX_TOKENS,
    tools: [SYNTHETIC_TOOL],
    tool_choice: "none",
  })) {
    if (event.type === "delta") {
      finalText += event.content;
      if (/get_test_value|tool_calls|"arguments"/i.test(event.content)) {
        leakedToolJsonCount += 1;
      }
    } else {
      secondMeta = event.result;
      if (!finalText && event.result.content) {
        finalText = event.result.content;
      }
    }
  }

  const pass =
    toolData.ok &&
    reconstructed.length === 1 &&
    executions === 1 &&
    Boolean(finalText.trim()) &&
    /ACTIVE/i.test(finalText) &&
    leakedToolJsonCount === 0 &&
    !(secondMeta?.toolCalls?.length);

  return {
    pass,
    reason: pass
      ? "OK"
      : !toolData.ok
        ? `TOOL_EXEC_${toolData.error}`
        : reconstructed.length !== 1
          ? `ACCUMULATOR_COUNT_${reconstructed.length}`
          : !finalText.trim()
            ? "NO_FINAL_STREAM_TEXT"
            : !/ACTIVE/i.test(finalText)
              ? "FINAL_MISSING_ACTIVE"
              : leakedToolJsonCount
                ? "TOOL_JSON_LEAK"
                : "UNKNOWN",
    streamEvidence,
    toolCallId: call.id,
    argsFormat: typeof call.function.arguments,
    toolResult: toolData,
    executions,
    second: {
      returnedModel: secondMeta?.returnedModel,
      finishReason: secondMeta?.finishReason ?? null,
      usage: secondMeta?.usage,
      finalPreview: finalText.slice(0, 160),
      leakedToolJsonCount,
      toolCallsCount: secondMeta?.toolCalls?.length ?? 0,
    },
  };
}

async function captureRawToolStreamDeltas(messages) {
  const { getAiRuntimeConfig } = await import("../src/lib/ai/config.ts");
  const { fetchWithTlsFallback } = await import("../src/lib/google-fetch.ts");
  const config = getAiRuntimeConfig();
  if (!config) {
    return { payloads: [], summary: [] };
  }

  const body = {
    model: MODEL,
    messages,
    stream: true,
    max_tokens: MAX_TOKENS,
    tools: [SYNTHETIC_TOOL],
    tool_choice: "auto",
  };

  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] =
      process.env.OPENROUTER_HTTP_REFERER?.trim() || "http://localhost:3000";
    headers["X-OpenRouter-Title"] =
      process.env.OPENROUTER_APP_TITLE?.trim() || "Sharp & Spice Team Platform";
  }

  const response = await fetchWithTlsFallback(config.completionsUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    const err = await response.text();
    return {
      payloads: [],
      summary: [{ error: `HTTP_${response.status}`, bodyPreview: err.slice(0, 120) }],
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const payloads = [];
  const summary = [];

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
        const parsed = JSON.parse(data);
        payloads.push(parsed);
        const delta = parsed.choices?.[0]?.delta;
        const toolCalls = delta?.tool_calls;
        if (Array.isArray(toolCalls) && toolCalls.length) {
          summary.push({
            kind: "tool_calls_delta",
            finish_reason: parsed.choices?.[0]?.finish_reason ?? null,
            calls: toolCalls.map((c) => ({
              index: c.index,
              hasId: Boolean(c.id),
              idLen: c.id ? String(c.id).length : 0,
              nameFragment: c.function?.name
                ? String(c.function.name).slice(0, 40)
                : null,
              argsFragmentLen: c.function?.arguments
                ? String(c.function.arguments).length
                : 0,
            })),
            hasContent: Boolean(delta?.content),
            hasUsage: Boolean(parsed.usage),
          });
        } else if (delta?.content) {
          summary.push({
            kind: "content_delta",
            len: String(delta.content).length,
            finish_reason: parsed.choices?.[0]?.finish_reason ?? null,
          });
        } else if (parsed.choices?.[0]?.finish_reason) {
          summary.push({
            kind: "finish",
            finish_reason: parsed.choices[0].finish_reason,
            hasUsage: Boolean(parsed.usage),
          });
        } else if (parsed.usage) {
          summary.push({ kind: "usage", usage: parsed.usage });
        }
      } catch {
        // ignore
      }
    }
  }

  return { payloads, summary };
}

async function optionalKbSmoke() {
  const folder = process.env.GOOGLE_DRIVE_KB_FOLDER_ID?.trim();
  if (!folder) {
    return { status: "SKIPPED", reason: "GOOGLE_DRIVE_KB_FOLDER_ID unset" };
  }
  if (process.env.SPIKE_KB !== "1" && process.env.SPIKE_KB_ONLY !== "1") {
    return {
      status: "SKIPPED",
      reason: "Set SPIKE_KB=1 (or SPIKE_KB_ONLY=1) to enable optional KB smoke",
    };
  }

  try {
    const { executeSearchKnowledgeBase } = await import(
      "../src/lib/ai/workspace-tools/kb-tools.ts"
    );
    const result = await executeSearchKnowledgeBase(
      {
        query: "required documents temporary residence",
        limit: 2,
      },
      {
        requestId: "kb-smoke",
        userId: "spike",
        chatId: null,
      },
    );

    const data = result.data && typeof result.data === "object" ? result.data : {};
    const hits = Array.isArray(data.hits) ? data.hits.length : null;
    return {
      status: result.ok || result.errorCode === "NOT_FOUND" ? "PASS" : "FAIL",
      ok: result.ok,
      errorCode: result.errorCode,
      resultCount: result.resultCount,
      hits,
      retrievalMode: data.retrievalMode ?? null,
      latencyMs: result.latencyMs,
      // Do not dump snippets/titles (may contain internal wording).
    };
  } catch (error) {
    return {
      status: "FAIL",
      reason: error instanceof Error ? error.message : "kb_smoke_exception",
    };
  }
}

function sumTokens(usages) {
  let input = 0;
  let output = 0;
  let haveIn = false;
  let haveOut = false;
  for (const u of usages) {
    if (!u) continue;
    if (typeof u.inputTokens === "number") {
      input += u.inputTokens;
      haveIn = true;
    }
    if (typeof u.outputTokens === "number") {
      output += u.outputTokens;
      haveOut = true;
    }
  }
  return {
    inputTokens: haveIn ? input : "NOT_AVAILABLE",
    outputTokens: haveOut ? output : "NOT_AVAILABLE",
  };
}

async function main() {
  if (process.env.SPIKE_KB_ONLY === "1") {
    const kb = await optionalKbSmoke();
    console.log(JSON.stringify({ phase: "kb_smoke_only", ...kb }, null, 2));
    if (kb.status === "FAIL") process.exit(1);
    return;
  }

  if (!isAiConfigured()) {
    console.log("LIVE_ASTRA_TOOL_VALIDATION_BLOCKED_NO_API_KEY");
    process.exit(2);
  }

  console.log(
    JSON.stringify(
      {
        phase: "env",
        openRouterConfigured: true,
        modelRequested: MODEL,
        openRouterModelEnv: process.env.OPENROUTER_MODEL ?? null,
        workspaceModelEnv: process.env.AI_WORKSPACE_MODEL ?? null,
      },
      null,
      2,
    ),
  );

  console.log("=== NON_STREAM ===");
  const nonStream = await runNonStreamLoop();
  console.log(JSON.stringify({ phase: "non_stream", ...nonStream }, null, 2));

  console.log("=== STREAM ===");
  const stream = await runStreamLoop();
  console.log(JSON.stringify({ phase: "stream", ...stream }, null, 2));

  const kb = await optionalKbSmoke();
  console.log(JSON.stringify({ phase: "kb_smoke", ...kb }, null, 2));

  const totals = sumTokens([
    nonStream.evidence?.usage,
    nonStream.second?.usage,
    stream.streamEvidence?.usage,
    stream.second?.usage,
  ]);

  console.log(
    JSON.stringify(
      {
        phase: "summary",
        LIVE_NON_STREAM_TOOL_LOOP: nonStream.pass ? "PASS" : "FAIL",
        LIVE_STREAM_TOOL_LOOP: stream.pass ? "PASS" : "FAIL",
        STREAM_TOOL_ACCUMULATION:
          stream.streamEvidence?.reconstructed?.length === 1 ? "PASS" : "FAIL",
        nonStreamReason: nonStream.reason,
        streamReason: stream.reason,
        tokens: totals,
        liveCallsEstimate: "non-stream x2 + stream x2 (+ raw stream capture = +1) ≈ 5",
      },
      null,
      2,
    ),
  );

  if (!nonStream.pass || !stream.pass) process.exit(1);
}

main().catch((err) => {
  console.error("SPIKE_FAILED", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
