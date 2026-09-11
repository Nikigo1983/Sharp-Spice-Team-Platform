/**
 * Validate + execute a single allowlisted tool call.
 */

import { getWorkspaceToolDefinition } from "@/lib/ai/workspace-tools/registry";
import { stripForbiddenAuthArgs } from "@/lib/ai/workspace-tools/security";
import { incrementWorkspaceToolMetric } from "@/lib/ai/workspace-tools/metrics";
import type {
  WorkspaceToolCall,
  WorkspaceToolContext,
  WorkspaceToolResult,
} from "@/lib/ai/workspace-tools/types";

/** Default per-tool wall clock (ms). */
export const DEFAULT_TOOL_EXECUTION_TIMEOUT_MS = 20_000;

function parseArguments(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw || "{}") as unknown;
    } catch {
      return { __parse_error: true, raw };
    }
  }
  return raw;
}

function normalizeCacheKey(name: string, args: unknown): string {
  return `${name}:${JSON.stringify(args)}`;
}

export type ToolExecutorCache = Map<string, WorkspaceToolResult>;

export type ToolExecutorState = {
  cache: ToolExecutorCache;
  /** tool_call_id values already executed this turn */
  seenToolCallIds: Set<string>;
  timeoutMs: number;
};

export function createToolExecutorState(
  timeoutMs: number = DEFAULT_TOOL_EXECUTION_TIMEOUT_MS,
): ToolExecutorState {
  return {
    cache: new Map(),
    seenToolCallIds: new Set(),
    timeoutMs,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("TOOL_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function executeWorkspaceToolCall(params: {
  call: WorkspaceToolCall;
  context: WorkspaceToolContext;
  /** @deprecated prefer state */
  cache?: ToolExecutorCache;
  state?: ToolExecutorState;
}): Promise<WorkspaceToolResult> {
  const { call, context } = params;
  const state =
    params.state ??
    ({
      cache: params.cache ?? new Map(),
      seenToolCallIds: new Set<string>(),
      timeoutMs: DEFAULT_TOOL_EXECUTION_TIMEOUT_MS,
    } satisfies ToolExecutorState);

  incrementWorkspaceToolMetric("tool_call_requested");

  const callId = typeof call.id === "string" ? call.id.trim() : "";
  if (callId && state.seenToolCallIds.has(callId)) {
    incrementWorkspaceToolMetric("duplicate_tool_blocked");
    incrementWorkspaceToolMetric("tool_call_error");
    return {
      ok: false,
      tool: call.name,
      toolCallId: callId,
      errorCode: "INVALID_ARGS",
      errorMessage: "Duplicate tool_call_id blocked",
      data: { error: "DUPLICATE_TOOL_CALL_ID" },
      latencyMs: 0,
      resultCount: null,
      outputChars: 0,
      cacheHit: false,
      sourceTags: [],
    };
  }
  if (callId) state.seenToolCallIds.add(callId);

  const def = getWorkspaceToolDefinition(call.name);
  if (!def) {
    incrementWorkspaceToolMetric("unknown_tool");
    incrementWorkspaceToolMetric("tool_call_error");
    return {
      ok: false,
      tool: call.name,
      toolCallId: call.id,
      errorCode: "INVALID_ARGS",
      errorMessage: `Unknown or unregistered tool: ${call.name}`,
      data: { error: "UNREGISTERED_TOOL", tool: call.name },
      latencyMs: 0,
      resultCount: null,
      outputChars: 0,
      cacheHit: false,
      sourceTags: [],
    };
  }

  const parsed = parseArguments(call.arguments);
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    "__parse_error" in (parsed as object)
  ) {
    incrementWorkspaceToolMetric("tool_json_parse_error");
    incrementWorkspaceToolMetric("tool_call_error");
    return {
      ok: false,
      tool: def.name,
      toolCallId: call.id,
      errorCode: "INVALID_ARGS",
      errorMessage: "Tool arguments are not valid JSON",
      data: { error: "INVALID_JSON" },
      latencyMs: 0,
      resultCount: null,
      outputChars: 0,
      cacheHit: false,
      sourceTags: [],
    };
  }

  const { cleaned } = stripForbiddenAuthArgs(parsed);

  const cacheKey = normalizeCacheKey(def.name, cleaned);
  const cached = state.cache.get(cacheKey);
  if (cached) {
    incrementWorkspaceToolMetric("tool_call_success");
    return {
      ...cached,
      toolCallId: call.id,
      cacheHit: true,
      latencyMs: 0,
    };
  }

  try {
    const executed = await withTimeout(
      def.execute(cleaned, context),
      state.timeoutMs,
    );
    const result: WorkspaceToolResult = {
      ...executed,
      toolCallId: call.id,
      cacheHit: false,
    };
    state.cache.set(cacheKey, result);
    if (result.ok) {
      incrementWorkspaceToolMetric("tool_call_success");
    } else {
      incrementWorkspaceToolMetric("tool_call_error");
    }
    return result;
  } catch (error) {
    incrementWorkspaceToolMetric("tool_call_error");
    const isTimeout =
      error instanceof Error && error.message === "TOOL_TIMEOUT";
    return {
      ok: false,
      tool: def.name,
      toolCallId: call.id,
      errorCode: isTimeout ? "TIMEOUT" : "INTERNAL_ERROR",
      errorMessage: isTimeout
        ? "Tool execution timed out"
        : error instanceof Error
          ? error.message
          : "Tool execution failed",
      data: { error: isTimeout ? "TIMEOUT" : "INTERNAL_ERROR" },
      latencyMs: state.timeoutMs,
      resultCount: null,
      outputChars: 0,
      cacheHit: false,
      sourceTags: [],
    };
  }
}

export function toolResultToMessageContent(result: WorkspaceToolResult): string {
  return JSON.stringify({
    ok: result.ok,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    data: result.data,
  });
}
