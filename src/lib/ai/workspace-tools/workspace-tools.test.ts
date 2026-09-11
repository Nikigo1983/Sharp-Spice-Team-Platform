import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ChatCompletionResult, ChatMessage } from "@/lib/ai/openai";
import {
  CLIENT_TOOL_DENYLIST,
  deepRedactToolPayload,
  isDeniedClientFieldKey,
  projectSafeClient,
  stripForbiddenAuthArgs,
  validateSearchClientsArgs,
  validateGetClientArgs,
  isRegisteredWorkspaceTool,
  executeWorkspaceToolCall,
  createToolExecutorState,
  StreamToolCallAccumulator,
  runWorkspaceAgentToolLoop,
  DEFAULT_TOOL_LOOP_LIMITS,
  resetWorkspaceToolMetrics,
  getWorkspaceToolMetricsSnapshot,
  sanitizeToolCallTraceEntry,
  assertSafeToolTracePayload,
} from "@/lib/ai/workspace-tools/index";
import type { Client } from "@/lib/google-sheets/types";

describe("workspace-tools schemas", () => {
  it("rejects oversized search query and unknown fields", () => {
    const oversized = validateSearchClientsArgs({
      query: "x".repeat(201),
    });
    assert.equal(oversized.ok, false);

    const unknown = validateSearchClientsArgs({
      query: "Антонова",
      userId: "hack",
    });
    assert.equal(unknown.ok, false);

    const ok = validateSearchClientsArgs({ query: "Антонова", limit: 3 });
    assert.equal(ok.ok, true);
  });

  it("strips auth fields from tool args without accepting them", () => {
    const { cleaned, rejectedAuthFields } = stripForbiddenAuthArgs({
      clientId: "CL-1",
      userId: "attacker",
      role: "admin",
    });
    assert.deepEqual(rejectedAuthFields.sort(), ["role", "userId"].sort());
    assert.deepEqual(cleaned, { clientId: "CL-1" });
  });

  it("rejects invalid clientId", () => {
    assert.equal(validateGetClientArgs({}).ok, false);
    assert.equal(validateGetClientArgs({ clientId: "" }).ok, false);
  });
});

describe("workspace-tools security", () => {
  it("denies appPassword and redacts payloads", () => {
    assert.equal(isDeniedClientFieldKey("appPassword"), true);
    assert.equal(CLIENT_TOOL_DENYLIST.has("appPassword"), true);
    const redacted = deepRedactToolPayload({
      name: "Test",
      appPassword: "secret",
      notes: 'appPassword: "leak"',
    }) as Record<string, unknown>;
    assert.equal(redacted.appPassword, "[REDACTED]");
    assert.match(String(redacted.notes), /REDACTED/i);
  });

  it("projectSafeClient never includes appPassword", () => {
    const client = {
      id: "CL-1",
      name: "Антонова",
      phone: "",
      email: "a@b.c",
      country: "",
      citizenship: "ANTONOVA",
      direction: "Хорватия",
      status: "В работе",
      manager: "M",
      lastActivity: "",
      createdAt: "",
      bookingAddress: "Street 1",
      appPassword: "SECRET",
      partnerName: "Лена",
      notes: "ok",
    } as Client;
    const safe = projectSafeClient(client);
    assert.equal("appPassword" in safe, false);
    assert.equal(safe.bookingAddress, "Street 1");
    assert.equal(safe.email, "a@b.c");
  });
});

describe("workspace-tools registry", () => {
  it("only allows registered tools", () => {
    assert.equal(isRegisteredWorkspaceTool("search_clients"), true);
    assert.equal(isRegisteredWorkspaceTool("drop_database"), false);
  });

  it("rejects unregistered tool execution", async () => {
    const result = await executeWorkspaceToolCall({
      call: {
        id: "1",
        name: "query_database",
        arguments: { sql: "select * from clients" },
      },
      context: {
        requestId: "t",
        userId: "u",
        chatId: null,
      },
      cache: new Map(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "INVALID_ARGS");
  });
});

describe("stream tool call accumulator", () => {
  it("reconstructs fragmented tool_calls", () => {
    const acc = new StreamToolCallAccumulator();
    acc.ingestDelta({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                function: { name: "search_", arguments: "" },
              },
            ],
          },
        },
      ],
    });
    acc.ingestDelta({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                function: { name: "clients", arguments: '{"que' },
              },
            ],
          },
        },
      ],
    });
    acc.ingestDelta({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                function: { arguments: 'ry":"Антонова"}' },
              },
            ],
          },
        },
      ],
    });
    const finalized = acc.finalize();
    assert.equal(finalized.length, 1);
    assert.equal(finalized[0].function.name, "search_clients");
    assert.equal(
      JSON.parse(finalized[0].function.arguments).query,
      "Антонова",
    );
  });

  it("matches live Astra: id only on first delta + empty + fragmented args", () => {
    const acc = new StreamToolCallAccumulator();
    // Observed live shape: id+name first; later empty/partial argument fragments only.
    acc.ingestDelta({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_QBahaB7wRToFUvdAL3eSXLbL",
                function: { name: "get_test_value", arguments: "" },
              },
            ],
          },
        },
      ],
    });
    acc.ingestDelta({
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: "" } }],
          },
        },
      ],
    });
    for (const frag of ["{\"", "account", "\":\"", "demo", "\"}"]) {
      acc.ingestDelta({
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: frag } }],
            },
          },
        ],
      });
    }
    acc.ingestDelta({
      choices: [{ finish_reason: "tool_calls", delta: {} }],
    });

    const finalized = acc.finalize();
    assert.equal(finalized.length, 1);
    assert.equal(finalized[0].id, "call_QBahaB7wRToFUvdAL3eSXLbL");
    assert.equal(finalized[0].function.name, "get_test_value");
    assert.equal(finalized[0].function.arguments, '{"account":"demo"}');
    assert.deepEqual(JSON.parse(finalized[0].function.arguments), {
      account: "demo",
    });
  });

  it("distinguishes multiple streamed tool calls by index", () => {
    const acc = new StreamToolCallAccumulator();
    acc.ingestDelta({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_a",
                function: { name: "search_clients", arguments: '{"q' },
              },
              {
                index: 1,
                id: "call_b",
                function: { name: "get_client", arguments: '{"c' },
              },
            ],
          },
        },
      ],
    });
    acc.ingestDelta({
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, function: { arguments: 'uery":"A"}' } },
              { index: 1, function: { arguments: 'lientId":"1"}' } },
            ],
          },
        },
      ],
    });
    const finalized = acc.finalize();
    assert.equal(finalized.length, 2);
    assert.equal(finalized[0].id, "call_a");
    assert.equal(finalized[0].function.name, "search_clients");
    assert.equal(finalized[1].id, "call_b");
    assert.equal(finalized[1].function.name, "get_client");
    assert.equal(JSON.parse(finalized[0].function.arguments).query, "A");
    assert.equal(JSON.parse(finalized[1].function.arguments).clientId, "1");
  });

  it("does not finalize nameless incomplete slots", () => {
    const acc = new StreamToolCallAccumulator();
    acc.ingestDelta({
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: "call_x", function: { arguments: "{" } },
            ],
          },
        },
      ],
    });
    assert.equal(acc.finalize().length, 0);
  });
});

describe("tool executor edge cases", () => {
  const ctx = {
    requestId: "req",
    userId: "user",
    chatId: null as string | null,
  };

  it("handles malformed JSON arguments", async () => {
    const result = await executeWorkspaceToolCall({
      call: {
        id: "bad",
        name: "search_clients",
        arguments: "{not-json",
      },
      context: ctx,
      cache: new Map(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "INVALID_ARGS");
    assert.equal(result.toolCallId, "bad");
  });

  it("handles incomplete JSON object that parses but fails schema", async () => {
    const result = await executeWorkspaceToolCall({
      call: {
        id: "inc",
        name: "get_client",
        arguments: "{}",
      },
      context: ctx,
      cache: new Map(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "INVALID_ARGS");
  });
});

describe("workspace agent tool loop (mocked)", () => {
  const ctx = {
    requestId: "req",
    userId: "user",
    chatId: null as string | null,
  };

  it("round 2 uses role=tool with matching tool_call_id", async () => {
    let round = 0;
    let sawToolMessage = false;
    const loop = await runWorkspaceAgentToolLoop({
      messages: [{ role: "user", content: "status?" }],
      context: ctx,
      completeFn: async (messages) => {
        round += 1;
        if (round === 1) {
          return {
            content: null,
            ok: true,
            requestedModel: "m",
            returnedModel: "m",
            usage: { inputTokens: 1, outputTokens: 1 },
            latencyMs: 1,
            finishReason: "tool_calls",
            toolCalls: [
              {
                id: "call_live_1",
                type: "function",
                function: {
                  name: "search_clients",
                  arguments: JSON.stringify({ query: "demo", limit: 1 }),
                },
              },
            ],
          };
        }
        const toolMsg = messages.find((m) => m.role === "tool");
        assert.ok(toolMsg);
        assert.equal(toolMsg?.tool_call_id, "call_live_1");
        assert.equal(toolMsg?.name, "search_clients");
        sawToolMessage = true;
        const assistant = [...messages]
          .reverse()
          .find((m) => m.role === "assistant" && m.tool_calls?.length);
        assert.ok(assistant?.tool_calls?.[0]?.id === "call_live_1");
        return {
          content: "Готово без JSON инструментов.",
          ok: true,
          requestedModel: "m",
          returnedModel: "m",
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
          finishReason: "stop",
        };
      },
    });
    assert.equal(sawToolMessage, true);
    assert.equal(loop.stopReason, "final_answer");
    assert.equal(loop.answer, "Готово без JSON инструментов.");
    assert.doesNotMatch(loop.answer ?? "", /tool_calls|"arguments"/i);
  });

  it("final answer must not leak tool JSON", async () => {
    const loop = await runWorkspaceAgentToolLoop({
      messages: [{ role: "user", content: "hi" }],
      context: ctx,
      completeFn: async () => ({
        content: "Короткий ответ менеджеру.",
        ok: true,
        requestedModel: "m",
        returnedModel: "m",
        usage: { inputTokens: 1, outputTokens: 1 },
        latencyMs: 1,
        finishReason: "stop",
      }),
    });
    assert.doesNotMatch(loop.answer ?? "", /tool_calls|get_test_value|"arguments"/i);
  });

  it("surfaces tool execution errors without crashing the loop", async () => {
    let round = 0;
    const loop = await runWorkspaceAgentToolLoop({
      messages: [{ role: "user", content: "fail" }],
      context: ctx,
      completeFn: async (messages) => {
        round += 1;
        if (round === 1) {
          return {
            content: null,
            ok: true,
            requestedModel: "m",
            returnedModel: "m",
            usage: { inputTokens: 1, outputTokens: 1 },
            latencyMs: 1,
            finishReason: "tool_calls",
            toolCalls: [
              {
                id: "err1",
                type: "function",
                function: {
                  name: "get_client",
                  arguments: JSON.stringify({ clientId: "missing-id-xyz" }),
                },
              },
            ],
          };
        }
        const toolMsg = messages.find((m) => m.role === "tool");
        assert.ok(toolMsg?.content);
        assert.match(String(toolMsg?.content), /NOT_FOUND|SOURCE_UNAVAILABLE|ok":false/i);
        return {
          content: "Клиент не найден в источнике.",
          ok: true,
          requestedModel: "m",
          returnedModel: "m",
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
          finishReason: "stop",
        };
      },
    });
    assert.equal(loop.toolCalls[0].ok, false);
    assert.ok(
      loop.toolCalls[0].errorCode === "NOT_FOUND" ||
        loop.toolCalls[0].errorCode === "SOURCE_UNAVAILABLE" ||
        loop.toolCalls[0].errorCode === "INVALID_ARGS",
    );
    assert.equal(loop.stopReason, "final_answer");
  });

  it("TEST 1: final answer without tools", async () => {
    const loop = await runWorkspaceAgentToolLoop({
      messages: [{ role: "user", content: "привет" }],
      context: ctx,
      completeFn: async () => ({
        content: "Здравствуйте!",
        ok: true,
        requestedModel: "openai/gpt-6-astra",
        returnedModel: "openai/gpt-6-astra",
        usage: { inputTokens: 10, outputTokens: 5 },
        latencyMs: 1,
      }),
    });
    assert.equal(loop.stopReason, "final_answer");
    assert.equal(loop.toolCalls.length, 0);
    assert.equal(loop.answer, "Здравствуйте!");
  });

  it("TEST 2: search_clients then answer", async () => {
    let round = 0;
    const loop = await runWorkspaceAgentToolLoop({
      messages: [{ role: "user", content: "Что по Антоновой?" }],
      context: ctx,
      completeFn: async () => {
        round += 1;
        if (round === 1) {
          return {
            content: null,
            ok: true,
            requestedModel: "m",
            returnedModel: "m",
            usage: { inputTokens: 1, outputTokens: 1 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "c1",
                type: "function",
                function: {
                  name: "search_clients",
                  arguments: JSON.stringify({ query: "Антонова", limit: 3 }),
                },
              },
            ],
          } satisfies ChatCompletionResult;
        }
        return {
          content: "Нашёл клиента, уточните детали.",
          ok: true,
          requestedModel: "m",
          returnedModel: "m",
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      },
    });
    assert.equal(loop.astraRounds, 2);
    assert.ok(loop.toolCalls.length >= 1);
    assert.equal(loop.toolCalls[0].toolName, "search_clients");
    assert.equal(loop.stopReason, "final_answer");
  });

  it("TEST 5: unknown tool rejected safely", async () => {
    let round = 0;
    const loop = await runWorkspaceAgentToolLoop({
      messages: [{ role: "user", content: "hack" }],
      context: ctx,
      completeFn: async (messages: ChatMessage[]) => {
        round += 1;
        if (round === 1) {
          return {
            content: null,
            ok: true,
            requestedModel: "m",
            returnedModel: "m",
            usage: { inputTokens: 1, outputTokens: 1 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "x",
                type: "function",
                function: {
                  name: "drop_all",
                  arguments: "{}",
                },
              },
            ],
          };
        }
        const toolMsg = messages.find((m) => m.role === "tool");
        assert.ok(toolMsg);
        assert.match(String(toolMsg?.content), /UNREGISTERED_TOOL|Unknown/i);
        return {
          content: "Инструмент недоступен.",
          ok: true,
          requestedModel: "m",
          returnedModel: "m",
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      },
    });
    assert.equal(loop.toolCalls[0].ok, false);
    assert.equal(loop.toolCalls[0].errorCode, "INVALID_ARGS");
  });

  it("TEST 6: identical tool+args deduped", async () => {
    let round = 0;
    const loop = await runWorkspaceAgentToolLoop({
      messages: [{ role: "user", content: "again" }],
      context: ctx,
      completeFn: async () => {
        round += 1;
        if (round <= 2) {
          return {
            content: null,
            ok: true,
            requestedModel: "m",
            returnedModel: "m",
            usage: { inputTokens: 1, outputTokens: 1 },
            latencyMs: 1,
            toolCalls: [
              {
                id: `c${round}`,
                type: "function",
                function: {
                  name: "search_clients",
                  arguments: JSON.stringify({ query: "Test", limit: 2 }),
                },
              },
            ],
          };
        }
        return {
          content: "done",
          ok: true,
          requestedModel: "m",
          returnedModel: "m",
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      },
    });
    assert.ok(loop.toolCalls.length >= 2);
    assert.equal(loop.toolCalls[0].cacheHit, false);
    assert.equal(loop.toolCalls[1].cacheHit, true);
  });

  it("TEST 7: max rounds stops", async () => {
    const loop = await runWorkspaceAgentToolLoop({
      messages: [{ role: "user", content: "loop" }],
      context: ctx,
      limits: { maxToolRounds: 2, maxToolCallsPerTurn: 20 },
      completeFn: async () => ({
        content: null,
        ok: true,
        requestedModel: "m",
        returnedModel: "m",
        usage: { inputTokens: 1, outputTokens: 1 },
        latencyMs: 1,
        toolCalls: [
          {
            id: "c",
            type: "function",
            function: {
              name: "search_clients",
              arguments: JSON.stringify({
                query: `q-${Math.random()}`,
                limit: 1,
              }),
            },
          },
        ],
      }),
    });
    assert.equal(loop.stopReason, "max_rounds");
    assert.equal(loop.astraRounds, 2);
  });

  it("TEST 8: data budget stop", async () => {
    const loop = await runWorkspaceAgentToolLoop({
      messages: [{ role: "user", content: "budget" }],
      context: ctx,
      limits: {
        maxToolRounds: 6,
        totalToolDataBudgetChars: 10,
      },
      completeFn: async () => ({
        content: null,
        ok: true,
        requestedModel: "m",
        returnedModel: "m",
        usage: { inputTokens: 1, outputTokens: 1 },
        latencyMs: 1,
        toolCalls: [
          {
            id: "c",
            type: "function",
            function: {
              name: "search_clients",
              arguments: JSON.stringify({ query: "Антонова", limit: 5 }),
            },
          },
        ],
      }),
    });
    assert.equal(loop.stopReason, "data_budget");
  });

  it("defaults match Phase 1 limits", () => {
    assert.equal(DEFAULT_TOOL_LOOP_LIMITS.maxToolRounds, 6);
    assert.equal(DEFAULT_TOOL_LOOP_LIMITS.maxToolCallsPerTurn, 12);
    assert.equal(DEFAULT_TOOL_LOOP_LIMITS.maxParallelCalls, 3);
    assert.equal(DEFAULT_TOOL_LOOP_LIMITS.totalToolDataBudgetChars, 48_000);
    assert.equal(DEFAULT_TOOL_LOOP_LIMITS.maxWallClockMs, 45_000);
  });
});

describe("workspace agent feature flag", () => {
  it("defaults to off", async () => {
    const prev = process.env.AI_WORKSPACE_AGENT_TOOLS;
    delete process.env.AI_WORKSPACE_AGENT_TOOLS;
    const { getWorkspaceAiConfig, isWorkspaceAgentToolsEnabled } =
      await import("@/lib/ai/workspace-config");
    assert.equal(getWorkspaceAiConfig().agentToolsMode, "off");
    assert.equal(isWorkspaceAgentToolsEnabled(), false);
    if (prev !== undefined) process.env.AI_WORKSPACE_AGENT_TOOLS = prev;
  });

  it("true/1 map to internal (never broad on)", async () => {
    const {
      parseWorkspaceAgentToolsMode,
      shouldEnterWorkspaceAgentPath,
    } = await import("@/lib/ai/workspace-config");
    assert.equal(parseWorkspaceAgentToolsMode("true"), "internal");
    assert.equal(parseWorkspaceAgentToolsMode("1"), "internal");
    assert.equal(
      shouldEnterWorkspaceAgentPath({
        mode: "off",
        actor: {
          id: "u1",
          email: "owner@example.com",
          role: "owner",
        },
      }),
      false,
    );
  });

  it("flag OFF: shouldEnter is false regardless of actor", async () => {
    const { shouldEnterWorkspaceAgentPath } = await import(
      "@/lib/ai/workspace-config"
    );
    assert.equal(
      shouldEnterWorkspaceAgentPath({
        mode: "off",
        actor: { id: "u1", email: "a@b.c", role: "owner" },
      }),
      false,
    );
  });

  it("shadow mode never enters agent path (non-executing)", async () => {
    const { shouldEnterWorkspaceAgentPath, isWorkspaceAgentToolsEnabled } =
      await import("@/lib/ai/workspace-config");
    assert.equal(isWorkspaceAgentToolsEnabled("shadow"), false);
    assert.equal(
      shouldEnterWorkspaceAgentPath({
        mode: "shadow",
        actor: { id: "u1", email: "own@ex.com", role: "owner" },
      }),
      false,
    );
  });

  it("internal mode requires owner (or allowlisted email)", async () => {
    const prevRoles = process.env.AI_WORKSPACE_AGENT_INTERNAL_ROLES;
    const prevEmails = process.env.AI_WORKSPACE_AGENT_INTERNAL_EMAILS;
    process.env.AI_WORKSPACE_AGENT_INTERNAL_ROLES = "owner";
    delete process.env.AI_WORKSPACE_AGENT_INTERNAL_EMAILS;

    const {
      shouldEnterWorkspaceAgentPath,
      isWorkspaceAgentInternalEligible,
    } = await import("@/lib/ai/workspace-config");

    assert.equal(
      isWorkspaceAgentInternalEligible({
        id: "1",
        email: "mgr@ex.com",
        role: "manager",
      }),
      false,
    );
    assert.equal(
      shouldEnterWorkspaceAgentPath({
        mode: "internal",
        actor: { id: "1", email: "mgr@ex.com", role: "manager" },
      }),
      false,
    );
    assert.equal(
      shouldEnterWorkspaceAgentPath({
        mode: "internal",
        actor: { id: "1", email: "own@ex.com", role: "owner" },
      }),
      true,
    );

    process.env.AI_WORKSPACE_AGENT_INTERNAL_EMAILS = "mgr@ex.com";
    assert.equal(
      shouldEnterWorkspaceAgentPath({
        mode: "internal",
        actor: { id: "1", email: "mgr@ex.com", role: "manager" },
      }),
      true,
    );

    if (prevRoles !== undefined) {
      process.env.AI_WORKSPACE_AGENT_INTERNAL_ROLES = prevRoles;
    } else {
      delete process.env.AI_WORKSPACE_AGENT_INTERNAL_ROLES;
    }
    if (prevEmails !== undefined) {
      process.env.AI_WORKSPACE_AGENT_INTERNAL_EMAILS = prevEmails;
    } else {
      delete process.env.AI_WORKSPACE_AGENT_INTERNAL_EMAILS;
    }
  });
});

describe("workspace tool rollout safety", () => {
  const ctx = {
    requestId: "rollout-test",
    userId: "u-test",
    chatId: null as string | null,
  };

  it("blocks duplicate tool_call_id without re-executing", async () => {
    resetWorkspaceToolMetrics();
    const state = createToolExecutorState();
    const call = {
      id: "dup-1",
      name: "get_client",
      arguments: JSON.stringify({ clientId: "missing-xyz" }),
    };
    const first = await executeWorkspaceToolCall({ call, context: ctx, state });
    const second = await executeWorkspaceToolCall({ call, context: ctx, state });
    assert.equal(second.ok, false);
    assert.match(String(second.errorMessage), /Duplicate tool_call_id/i);
    assert.equal(second.data && (second.data as { error?: string }).error, "DUPLICATE_TOOL_CALL_ID");
    const metrics = getWorkspaceToolMetricsSnapshot();
    assert.equal(metrics.duplicate_tool_blocked, 1);
    assert.ok(metrics.tool_call_requested >= 2);
    // first may succeed or fail on missing client; second must be blocked
    assert.ok(first.toolCallId === "dup-1");
  });

  it("malformed JSON does not execute a tool", async () => {
    resetWorkspaceToolMetrics();
    const result = await executeWorkspaceToolCall({
      call: {
        id: "bad-json",
        name: "search_clients",
        arguments: "{not-json",
      },
      context: ctx,
      state: createToolExecutorState(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "INVALID_ARGS");
    assert.equal(
      (result.data as { error?: string }).error,
      "INVALID_JSON",
    );
    assert.equal(getWorkspaceToolMetricsSnapshot().tool_json_parse_error, 1);
  });

  it("unknown tool fails closed and increments metric", async () => {
    resetWorkspaceToolMetrics();
    const result = await executeWorkspaceToolCall({
      call: {
        id: "unk",
        name: "drop_database",
        arguments: "{}",
      },
      context: ctx,
      state: createToolExecutorState(),
    });
    assert.equal(result.ok, false);
    assert.equal(
      (result.data as { error?: string }).error,
      "UNREGISTERED_TOOL",
    );
    assert.equal(getWorkspaceToolMetricsSnapshot().unknown_tool, 1);
  });

  it("tool timeout returns TIMEOUT without crashing", async () => {
    resetWorkspaceToolMetrics();
    const { WORKSPACE_TOOL_REGISTRY } = await import(
      "@/lib/ai/workspace-tools/registry"
    );
    const original = WORKSPACE_TOOL_REGISTRY.search_clients.execute;
    WORKSPACE_TOOL_REGISTRY.search_clients.execute = async () => {
      await new Promise((r) => setTimeout(r, 80));
      return {
        ok: true,
        tool: "search_clients",
        errorCode: null,
        errorMessage: null,
        data: { matches: [] },
        latencyMs: 80,
        resultCount: 0,
        outputChars: 2,
        sourceTags: ["CLIENT"],
      };
    };
    try {
      const result = await executeWorkspaceToolCall({
        call: {
          id: "slow",
          name: "search_clients",
          arguments: JSON.stringify({ query: "x", limit: 1 }),
        },
        context: ctx,
        state: createToolExecutorState(10),
      });
      assert.equal(result.ok, false);
      assert.equal(result.errorCode, "TIMEOUT");
      assert.equal(getWorkspaceToolMetricsSnapshot().tool_call_error, 1);
    } finally {
      WORKSPACE_TOOL_REGISTRY.search_clients.execute = original;
    }
  });

  it("sanitize strips args/results from tool traces", () => {
    const dirty = {
      toolName: "search_knowledge_base",
      toolCallId: "c1",
      ok: true,
      errorCode: null,
      latencyMs: 12,
      resultCount: 1,
      outputChars: 40,
      cacheHit: false,
      arguments: { query: "secret passport 123" },
      result: { snippet: "PII content here" },
      data: { hits: ["kb body"] },
    };
    const safe = sanitizeToolCallTraceEntry(
      dirty as Parameters<typeof sanitizeToolCallTraceEntry>[0],
    );
    assert.equal(safe.toolName, "search_knowledge_base");
    assert.equal(safe.toolCallId, "c1");
    assert.equal(
      "arguments" in safe || "result" in safe || "data" in safe,
      false,
    );
    assert.equal(assertSafeToolTracePayload([safe]), true);
    assert.equal(assertSafeToolTracePayload([dirty]), false);
  });

  it("serializeWorkspaceAiTraceForLog never retains tool args", async () => {
    const { createEmptyWorkspaceAiTrace, serializeWorkspaceAiTraceForLog } =
      await import("@/lib/ai/workspace-trace");
    const trace = createEmptyWorkspaceAiTrace("req-sanitize");
    trace.agentMode = true;
    trace.toolCallCount = 1;
    trace.toolCalls = [
      {
        toolName: "search_clients",
        toolCallId: "t1",
        ok: true,
        errorCode: null,
        latencyMs: 5,
        resultCount: 0,
        outputChars: 10,
        cacheHit: false,
        arguments: { query: "should-not-log" },
      } as (typeof trace.toolCalls)[number] & { arguments: unknown },
    ];
    const serialized = serializeWorkspaceAiTraceForLog(trace);
    const json = JSON.stringify(serialized);
    assert.doesNotMatch(json, /should-not-log/);
    assert.doesNotMatch(json, /"arguments"/);
    const toolCalls = serialized.toolCalls as Array<Record<string, unknown>>;
    assert.equal(assertSafeToolTracePayload(toolCalls), true);
  });

  it("duplicate/replayed tool_call_id in loop is blocked", async () => {
    resetWorkspaceToolMetrics();
    let round = 0;
    const loop = await runWorkspaceAgentToolLoop({
      messages: [{ role: "user", content: "dup" }],
      context: ctx,
      completeFn: async () => {
        round += 1;
        if (round === 1) {
          return {
            content: null,
            ok: true,
            requestedModel: "m",
            returnedModel: "m",
            usage: { inputTokens: 1, outputTokens: 1 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "same-id",
                type: "function",
                function: {
                  name: "get_client",
                  arguments: JSON.stringify({ clientId: "missing-a" }),
                },
              },
              {
                id: "same-id",
                type: "function",
                function: {
                  name: "get_client",
                  arguments: JSON.stringify({ clientId: "missing-b" }),
                },
              },
            ],
          } satisfies ChatCompletionResult;
        }
        return {
          content: "ok",
          ok: true,
          requestedModel: "m",
          returnedModel: "m",
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      },
    });
    assert.equal(loop.toolCalls.length, 2);
    assert.equal(
      loop.toolCalls.filter((t) => t.errorCode === "INVALID_ARGS").length >= 1,
      true,
    );
    assert.ok(getWorkspaceToolMetricsSnapshot().duplicate_tool_blocked >= 1);
  });

  it("max rounds increments metric", async () => {
    resetWorkspaceToolMetrics();
    const loop = await runWorkspaceAgentToolLoop({
      messages: [{ role: "user", content: "loop" }],
      context: ctx,
      limits: {
        ...DEFAULT_TOOL_LOOP_LIMITS,
        maxToolRounds: 2,
        maxToolCallsPerTurn: 12,
      },
      completeFn: async () =>
        ({
          content: null,
          ok: true,
          requestedModel: "m",
          returnedModel: "m",
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
          toolCalls: [
            {
              id: `r-${Math.random()}`,
              type: "function",
              function: {
                name: "get_client",
                arguments: JSON.stringify({ clientId: "missing" }),
              },
            },
          ],
        }) satisfies ChatCompletionResult,
    });
    assert.equal(loop.stopReason, "max_rounds");
    assert.equal(getWorkspaceToolMetricsSnapshot().max_rounds_reached, 1);
  });

  it("second-round model failure increments metric", async () => {
    resetWorkspaceToolMetrics();
    let round = 0;
    const loop = await runWorkspaceAgentToolLoop({
      messages: [{ role: "user", content: "fail2" }],
      context: ctx,
      completeFn: async () => {
        round += 1;
        if (round === 1) {
          return {
            content: null,
            ok: true,
            requestedModel: "m",
            returnedModel: "m",
            usage: { inputTokens: 1, outputTokens: 1 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "c-fail2",
                type: "function",
                function: {
                  name: "get_client",
                  arguments: JSON.stringify({ clientId: "missing" }),
                },
              },
            ],
          } satisfies ChatCompletionResult;
        }
        return {
          content: null,
          ok: false,
          requestedModel: "m",
          returnedModel: "m",
          usage: { inputTokens: 1, outputTokens: 0 },
          latencyMs: 1,
          error: "MODEL_EMPTY_RESPONSE",
        };
      },
    });
    assert.equal(loop.stopReason, "model_error");
    assert.equal(getWorkspaceToolMetricsSnapshot().second_round_failure, 1);
  });
});
