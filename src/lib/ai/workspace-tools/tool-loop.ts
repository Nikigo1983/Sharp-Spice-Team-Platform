import { createAiDeadline, currentAiSignal, withAiRequestScope, throwIfAiAborted } from "@/lib/ai/request-scope";
/**
 * Bounded Astra ↔ tools orchestration loop.
 */

import {
  createChatCompletionResult,
  streamChatCompletionResult,
  type ChatCompletionOptions,
  type ChatCompletionResult,
  type ChatMessage,
  type ChatToolFunctionCall,
} from "@/lib/ai/openai";
import { buildOpenRouterToolDefinitions, toolUiStatusLabel } from "@/lib/ai/workspace-tools/registry";
import {
  createToolExecutorState,
  executeWorkspaceToolCall,
  toolResultToMessageContent,
} from "@/lib/ai/workspace-tools/executor";
import {
  incrementWorkspaceToolMetric,
  observeToolLoopLatencyMs,
} from "@/lib/ai/workspace-tools/metrics";
import {
  DEFAULT_TOOL_LOOP_LIMITS,
  type WorkspaceToolCallTraceEntry,
  type WorkspaceToolContext,
  type WorkspaceToolLoopLimits,
  type WorkspaceToolLoopStopReason,
  type WorkspaceToolResult,
} from "@/lib/ai/workspace-tools/types";

export type AgentToolStatusEvent =
  | { type: "tool_started"; tool: string; label: string }
  | {
      type: "tool_completed";
      tool: string;
      ok: boolean;
      resultCount: number | null;
    }
  | {
      type: "tool_failed";
      tool: string;
      errorCode: string | null;
    };

export type AgentLoopResult = {
  answer: string | null;
  stopReason: WorkspaceToolLoopStopReason;
  astraRounds: number;
  toolCalls: WorkspaceToolCallTraceEntry[];
  totalToolChars: number;
  finalSourceSet: string[];
  lastCompletion: ChatCompletionResult | null;
  messages: ChatMessage[];
  statusEvents: AgentToolStatusEvent[];
};

function sumUsage(
  a: ChatCompletionResult["usage"],
  b: ChatCompletionResult["usage"],
): ChatCompletionResult["usage"] {
  const add = (
    x: number | "NOT_AVAILABLE",
    y: number | "NOT_AVAILABLE",
  ): number | "NOT_AVAILABLE" => {
    if (typeof x === "number" && typeof y === "number") return x + y;
    if (typeof x === "number") return x;
    if (typeof y === "number") return y;
    return "NOT_AVAILABLE";
  };
  return {
    inputTokens: add(a.inputTokens, b.inputTokens),
    outputTokens: add(a.outputTokens, b.outputTokens),
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await fn(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function appendAssistantToolCallMessage(
  messages: ChatMessage[],
  toolCalls: ChatToolFunctionCall[],
  content: string | null,
): void {
  messages.push({
    role: "assistant",
    content: content,
    tool_calls: toolCalls,
  });
}

function appendToolResultMessages(
  messages: ChatMessage[],
  results: WorkspaceToolResult[],
): void {
  for (const result of results) {
    messages.push({
      role: "tool",
      tool_call_id: result.toolCallId,
      name: result.tool,
      content: toolResultToMessageContent(result),
    });
  }
}

async function runToolLoop(params: {
  messages: ChatMessage[];
  context: WorkspaceToolContext;
  completionOptions?: Omit<ChatCompletionOptions, "tools" | "tool_choice">;
  limits?: Partial<WorkspaceToolLoopLimits>;
  onStatus?: (event: AgentToolStatusEvent) => void | Promise<void>;
  /** When true, final answer text is streamed via onFinalDelta; intermediate rounds suppress content. */
  streamFinalAnswer?: boolean;
  onFinalDelta?: (delta: string) => void | Promise<void>;
  /** Test inject — non-stream completion. */
  completeFn?: (
    messages: ChatMessage[],
    options?: ChatCompletionOptions,
  ) => Promise<ChatCompletionResult>;
}): Promise<AgentLoopResult> {
  const limits: WorkspaceToolLoopLimits = {
    ...DEFAULT_TOOL_LOOP_LIMITS,
    ...params.limits,
  };
  const tools = buildOpenRouterToolDefinitions();
  const messages = [...params.messages];
  const executorState = createToolExecutorState();
  const toolTrace: WorkspaceToolCallTraceEntry[] = [];
  const sourceSet = new Set<string>();
  let totalToolChars = 0;
  let astraRounds = 0;
  let totalCalls = 0;
  let toolsExecuted = 0;
  let lastCompletion: ChatCompletionResult | null = null;
  let aggregatedUsage: ChatCompletionResult["usage"] = {
    inputTokens: "NOT_AVAILABLE",
    outputTokens: "NOT_AVAILABLE",
  };
  const wallStarted = Date.now();
  const statusEvents: AgentToolStatusEvent[] = [];

  const emitStatus = async (event: AgentToolStatusEvent) => {
    statusEvents.push(event);
    await params.onStatus?.(event);
  };

  const finish = (
    result: Omit<AgentLoopResult, "statusEvents" | "messages"> & {
      messages?: ChatMessage[];
    },
  ): AgentLoopResult => {
    observeToolLoopLatencyMs(Date.now() - wallStarted);
    if (result.stopReason === "max_rounds") {
      incrementWorkspaceToolMetric("max_rounds_reached");
    }
    if (result.stopReason === "model_error" && toolsExecuted > 0) {
      incrementWorkspaceToolMetric("second_round_failure");
    }
    return {
      ...result,
      messages: result.messages ?? messages,
      statusEvents,
    };
  };

  const completionOpts: ChatCompletionOptions = {
    ...params.completionOptions,
    tools,
    tool_choice: "auto",
  };

  while (astraRounds < limits.maxToolRounds) {
    throwIfAiAborted();
    if (Date.now() - wallStarted > limits.maxWallClockMs) {
      return finish({
        answer:
          "Не успел завершить сбор данных за отведённое время. Уточните запрос или повторите.",
        stopReason: "timeout",
        astraRounds,
        toolCalls: toolTrace,
        totalToolChars,
        finalSourceSet: [...sourceSet],
        lastCompletion,
      });
    }

    astraRounds += 1;
    let completion: ChatCompletionResult;

    if (params.streamFinalAnswer) {
      let meta: ChatCompletionResult | null = null;
      for await (const event of streamChatCompletionResult(
        messages,
        completionOpts,
      )) {
        if (event.type === "meta") {
          meta = event.result;
        }
      }
      completion = meta ?? {
        content: null,
        ok: false,
        requestedModel: params.completionOptions?.model ?? "UNKNOWN",
        returnedModel: "NOT_AVAILABLE",
        usage: aggregatedUsage,
        latencyMs: 0,
        error: "MODEL_EMPTY_RESPONSE",
      };
      if (
        completion.ok &&
        !completion.toolCalls?.length &&
        completion.content &&
        params.onFinalDelta
      ) {
        await params.onFinalDelta(completion.content);
      }
    } else {
      completion = params.completeFn
        ? await params.completeFn(messages, completionOpts)
        : await createChatCompletionResult(messages, completionOpts);
    }

    lastCompletion = completion;
    aggregatedUsage = sumUsage(aggregatedUsage, completion.usage);
    if (lastCompletion) {
      lastCompletion = { ...completion, usage: aggregatedUsage };
    }

    if (!completion.ok) {
      return finish({
        answer: null,
        stopReason: "model_error",
        astraRounds,
        toolCalls: toolTrace,
        totalToolChars,
        finalSourceSet: [...sourceSet],
        lastCompletion,
      });
    }

    const toolCalls = completion.toolCalls ?? [];
    if (toolCalls.length === 0) {
      return finish({
        answer: completion.content,
        stopReason: completion.content ? "final_answer" : "empty_response",
        astraRounds,
        toolCalls: toolTrace,
        totalToolChars,
        finalSourceSet: [...sourceSet],
        lastCompletion,
      });
    }

    if (totalCalls + toolCalls.length > limits.maxToolCallsPerTurn) {
      return finish({
        answer:
          "Достигнут лимит вызовов инструментов за один ответ. Уточните запрос.",
        stopReason: "max_calls",
        astraRounds,
        toolCalls: toolTrace,
        totalToolChars,
        finalSourceSet: [...sourceSet],
        lastCompletion,
      });
    }

    throwIfAiAborted();
    appendAssistantToolCallMessage(messages, toolCalls, completion.content);

    const batch = toolCalls.slice(0, limits.maxToolCallsPerTurn - totalCalls);
    for (const call of batch) {
      await emitStatus({
        type: "tool_started",
        tool: call.function.name,
        label: toolUiStatusLabel(call.function.name),
      });
    }

    const results = await mapPool(
      batch,
      limits.maxParallelCalls,
      async (call) =>
        executeWorkspaceToolCall({
          call: {
            id: call.id,
            name: call.function.name,
            arguments: call.function.arguments,
          },
          context: params.context,
          state: executorState,
        }),
    );

    for (const result of results) {
      totalCalls += 1;
      toolsExecuted += 1;
      totalToolChars += result.outputChars;
      for (const tag of result.sourceTags) sourceSet.add(tag);
      toolTrace.push({
        toolName: result.tool,
        toolCallId: result.toolCallId,
        ok: result.ok,
        errorCode: result.errorCode,
        latencyMs: result.latencyMs,
        resultCount: result.resultCount,
        outputChars: result.outputChars,
        cacheHit: result.cacheHit,
      });
      if (result.ok) {
        await emitStatus({
          type: "tool_completed",
          tool: result.tool,
          ok: true,
          resultCount: result.resultCount,
        });
      } else {
        await emitStatus({
          type: "tool_failed",
          tool: result.tool,
          errorCode: result.errorCode,
        });
      }
    }

    appendToolResultMessages(messages, results);

    if (totalToolChars >= limits.totalToolDataBudgetChars) {
      return finish({
        answer:
          "Собрал частичные данные, но достигнут лимит объёма контекста инструментов. Уточните вопрос или сузьте запрос.",
        stopReason: "data_budget",
        astraRounds,
        toolCalls: toolTrace,
        totalToolChars,
        finalSourceSet: [...sourceSet],
        lastCompletion,
      });
    }
  }

  return finish({
    answer:
      "Не удалось завершить рассуждение за допустимое число шагов. Уточните запрос.",
    stopReason: "max_rounds",
    astraRounds,
    toolCalls: toolTrace,
    totalToolChars,
    finalSourceSet: [...sourceSet],
    lastCompletion,
  });
}

export async function runWorkspaceAgentToolLoop(params: Parameters<typeof runToolLoop>[0]): Promise<AgentLoopResult> {
  const deadline = createAiDeadline(currentAiSignal(), params.limits?.maxWallClockMs ?? DEFAULT_TOOL_LOOP_LIMITS.maxWallClockMs);
  try { return await withAiRequestScope(deadline.signal, () => runToolLoop(params)); }
  finally { deadline.dispose(); }
}
