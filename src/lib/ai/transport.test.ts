import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createChatCompletionResult, createChatCompletion, streamChatCompletionResult, type StreamChatCompletionEvent } from "@/lib/ai/openai";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { getWorkspaceFinalModel, getAuxiliaryLlmModel, getWorkspaceRouterModelId } from "@/lib/ai/models";
import { withAiRequestScope } from "@/lib/ai/request-scope";
import { AiCompletionError } from "@/lib/ai/errors";
import { runClientAi } from "@/lib/ai/client-assistant";
import { getDemoClientDetail, DEMO_CLIENTS } from "@/lib/google-sheets/demo-data";
import { streamTask } from "@/lib/ai/stream-task";
import { fetchWithTlsFallback } from "@/lib/google-fetch";

const envNames = ["AI_PROVIDER", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "OPENAI_MODEL", "OPENROUTER_MODEL", "AI_WORKSPACE_MODEL", "AI_WORKSPACE_ROUTER_MODEL"];
let saved: Record<string, string | undefined>;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  saved = Object.fromEntries(envNames.map(k => [k, process.env[k]]));
  for (const key of envNames) delete process.env[key];
  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "test-only";
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of envNames) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
});
const messages = [{ role: "user" as const, content: "hello" }];
const encoder = new TextEncoder();
const frame = (text: string) => 'data: ' + text + '\r\n\r\n';
const delta = (text: string) => JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: null }] });
const stop = (reason = "stop") => JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] });
function sse(text: string) {
  return new Response(text, { headers: { "content-type": "text/event-stream" } });
}
async function streamResult(text: string) {
  globalThis.fetch = async () => sse(text);
  const events: StreamChatCompletionEvent[] = [];
  for await (const event of streamChatCompletionResult(messages)) events.push(event);
  const last = events.at(-1);
  assert.equal(last?.type, "meta");
  return last!.type === "meta" ? last.result : assert.fail();
}

test("explicit provider wins when both keys exist; no fallback if its key is missing", () => {
  process.env.OPENROUTER_API_KEY = "test-router";
  assert.equal(getAiRuntimeConfig()?.provider, "openai");
  delete process.env.OPENAI_API_KEY;
  assert.equal(getAiRuntimeConfig(), null);
  delete process.env.AI_PROVIDER;
  assert.equal(getAiRuntimeConfig()?.provider, "openrouter");
});

test("all direct OpenAI workloads use the direct model, ignoring OpenRouter defaults", () => {
  process.env.OPENAI_MODEL = "gpt-4.1-mini";
  process.env.OPENROUTER_MODEL = "anthropic/example";
  assert.equal(getWorkspaceFinalModel(), "gpt-4.1-mini");
  assert.equal(getAuxiliaryLlmModel(), "gpt-4.1-mini");
  assert.equal(getWorkspaceRouterModelId(), "gpt-4.1-mini");
  process.env.AI_WORKSPACE_MODEL = "openai/gpt-6-astra";
  assert.equal(getWorkspaceFinalModel(), "gpt-6-astra");
});

test("invalid provider/model never sends a request", async () => {
  globalThis.fetch = async () => assert.fail("must not fetch");
  process.env.AI_PROVIDER = "typo";
  assert.equal((await createChatCompletionResult(messages)).error, "AI_INVALID_CONFIG");
  process.env.AI_PROVIDER = "openai";
  assert.equal((await createChatCompletionResult(messages, { model: "anthropic/example" })).error, "AI_INVALID_CONFIG");
});

test("OpenAI body uses direct model and max_completion_tokens", async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "gpt-6-astra");
    assert.equal(body.max_completion_tokens, 2000);
    assert.equal(body.max_tokens, undefined);
    assert.equal(body.temperature, undefined);
    assert.equal(init?.redirect, "error");
    return Response.json({ model: "gpt-6-astra", choices: [{ finish_reason: "stop", message: { content: "ok" } }] });
  };
  assert.equal((await createChatCompletionResult(messages, { model: "openai/gpt-6-astra", maxTokens: 2000 })).ok, true);
});

test("OpenRouter body retains slug and max_tokens", async () => {
  process.env.AI_PROVIDER = "openrouter"; process.env.OPENROUTER_API_KEY = "test";
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "openai/gpt-6-astra");
    assert.equal(body.max_tokens, 2000);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] });
  };
  assert.equal((await createChatCompletionResult(messages, { maxTokens: 2000 })).ok, true);
});

test("first delta arrives before upstream completes; usage and CRLF are preserved", async () => {
  let upstream!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { upstream = c; c.enqueue(encoder.encode(frame(delta("Привет")))); } });
  globalThis.fetch = async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).stream_options.include_usage, true);
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  };
  const iterator = streamChatCompletionResult(messages);
  try {
    const first = await iterator.next();
    assert.deepEqual(first.value, { type: "delta", content: "Привет" });
    upstream.enqueue(encoder.encode(frame(stop()) + frame(JSON.stringify({ choices: [], usage: { prompt_tokens: 9, completion_tokens: 2 } })) + "data: [DONE]"));
    upstream.close();
    const last = await iterator.next();
    assert.equal(last.value?.type, "meta");
    if (last.value?.type === "meta") {
      assert.equal(last.value.result.ok, true);
      assert.deepEqual(last.value.result.usage, { inputTokens: 9, outputTokens: 2 });
    }
  } finally { await iterator.return(undefined); }
});

test("SSE handles frames and UTF-8 split across arbitrary bytes", async () => {
  const bytes = encoder.encode(frame(delta("Привет")) + frame(stop()) + frame("[DONE]"));
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(c) { for (const b of bytes) c.enqueue(new Uint8Array([b])); c.close(); },
  }), { headers: { "content-type": "text/event-stream" } });
  const events = [];
  for await (const event of streamChatCompletionResult(messages)) events.push(event);
  assert.deepEqual(events[0], { type: "delta", content: "Привет" });
  assert.equal(events.at(-1)?.type, "meta");
});

test("EOF without DONE is incomplete even after a finish reason", async () => {
  const result = await streamResult(frame(delta("partial")) + frame(stop()));
  assert.equal(result.ok, false); assert.equal(result.error, "MODEL_STREAM_INTERRUPTED");
  assert.equal(result.content, "partial");
});

test("truncation is not success and incomplete tool calls cannot execute", async () => {
  const result = await streamResult(frame(JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call1", type: "function", function: { name: "get_client", arguments: '{"id":' } }] }, finish_reason: null }] })) + frame(stop("length")) + frame("[DONE]"));
  assert.equal(result.ok, false); assert.equal(result.error, "MODEL_LENGTH_LIMIT");
  assert.equal(result.toolCalls, undefined);
});

test("malformed SSE and in-band errors are explicit failures", async () => {
  assert.equal((await streamResult(frame(delta("partial")) + frame("{broken"))).error, "MODEL_INVALID_RESPONSE");
  assert.equal((await streamResult(frame(JSON.stringify({ error: { message: "provider internal error" } })))).ok, false);
  assert.equal((await streamResult(frame(stop("content_filter")) + frame("[DONE]"))).error, "MODEL_CONTENT_FILTER");
});

test("non-stream length failures do not flow through string-only convenience wrapper", async () => {
  globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: "length", message: { content: "unfinished" } }] });
  const result = await createChatCompletionResult(messages);
  assert.equal(result.ok, false); assert.equal(result.error, "MODEL_LENGTH_LIMIT");
  assert.equal(await createChatCompletion(messages), null);
});

test("non-stream failures report actual provider; authentication is not retried", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("not authorized", { status: 401 }); };
  assert.equal((await createChatCompletionResult(messages)).error, "OPENAI_HTTP_401");
  assert.equal(calls, 1);
});

test("TLS/network failure does not invoke an insecure fallback or retry", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError("certificate invalid"); };
  assert.equal((await createChatCompletionResult(messages)).ok, false);
  assert.equal(calls, 1);
  await assert.rejects(fetchWithTlsFallback("https://example.invalid"), /certificate/);
  assert.equal(calls, 2);
});

test("request cancellation propagates through nested scope before a model request", async () => {
  const controller = new AbortController(); controller.abort();
  globalThis.fetch = async () => assert.fail("must not fetch");
  const result = await withAiRequestScope(controller.signal, () => createChatCompletionResult(messages));
  assert.equal(result.error, "AI_CANCELLED");
});

test("deadline aborts an in-flight model call", async () => {
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
  });
  assert.equal((await createChatCompletionResult(messages, { timeoutMs: 15 })).error, "AI_TIMEOUT");
});

test("cancellation while reading SSE retains partial text and stops transport", async () => {
  const controller = new AbortController();
  let transportAborted = false;
  globalThis.fetch = async (_url, init) => new Response(new ReadableStream({
    start(c) {
      c.enqueue(encoder.encode(frame(delta("partial"))));
      init!.signal!.addEventListener("abort", () => { transportAborted = true; c.error(init!.signal!.reason); }, { once: true });
    },
  }), { headers: { "content-type": "text/event-stream" } });
  const iterator = streamChatCompletionResult(messages, { signal: controller.signal });
  assert.equal((await iterator.next()).value?.type, "delta");
  controller.abort();
  const last = (await iterator.next()).value;
  assert.equal(last?.type, "meta");
  if (last?.type === "meta") { assert.equal(last.result.error, "AI_CANCELLED"); assert.equal(last.result.content, "partial"); }
  await iterator.return(undefined);
  assert.equal(transportAborted, true);
});

test("stopping iteration cancels reader and request deadline", async () => {
  let cancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(c) { c.enqueue(encoder.encode(frame(delta("a")))); },
    cancel() { cancelled = true; },
  }), { headers: { "content-type": "text/event-stream" } });
  const iterator = streamChatCompletionResult(messages);
  await iterator.next(); await iterator.return(undefined);
  assert.equal(cancelled, true);
});

test("client fallback cannot invent document or eligibility advice", async () => {
  delete process.env.OPENAI_API_KEY;
  const detail = getDemoClientDetail(DEMO_CLIENTS[0].id)!;
  for (const mode of ["summary", "chat"] as const) {
    await assert.rejects(runClientAi(detail, "Какие документы нужны?", mode), error => error instanceof AiCompletionError && error.code === "AI_NOT_CONFIGURED");
  }
});

test("callback tool status reaches consumer before task completion", async () => {
  let finish!: () => void;
  const iterator = streamTask<string, string>(async emit => {
    emit("started");
    await new Promise<void>(resolve => { finish = resolve; });
    return "complete";
  });
  assert.deepEqual((await iterator.next()).value, { event: "started" });
  finish();
  assert.deepEqual((await iterator.next()).value, { result: "complete" });
  await iterator.return(undefined);
});

test("explicit temporary HTTP failure retries within the same deadline", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return calls === 1 ? new Response("busy", { status: 503, headers: { "retry-after": "0.001" } })
      : Response.json({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] });
  };
  assert.equal((await createChatCompletionResult(messages)).ok, true);
  assert.equal(calls, 2);
});

test("cancellation interrupts retry backoff without sending another request", async () => {
  let calls = 0;
  const controller = new AbortController();
  globalThis.fetch = async () => {
    calls++;
    setTimeout(() => controller.abort(), 10);
    return new Response("busy", { status: 429, headers: { "retry-after": "30" } });
  };
  assert.equal((await createChatCompletionResult(messages, { signal: controller.signal })).error, "AI_CANCELLED");
  assert.equal(calls, 1);
});
