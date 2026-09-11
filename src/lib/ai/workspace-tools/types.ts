/**
 * Phase 1: native Astra read-only tool types for AI Workspace.
 */

export type WorkspaceToolName =
  | "search_clients"
  | "get_client"
  | "get_case_context"
  | "search_knowledge_base";

export type WorkspaceToolErrorCode =
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "FORBIDDEN"
  | "SOURCE_UNAVAILABLE"
  | "EXTRACTION_UNSUPPORTED"
  | "EXTRACTION_EMPTY"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "PARTIAL_RESULTS"
  | "INVALID_ARGS"
  | "INTERNAL_ERROR";

/** Trusted server-side context — never accepted from model tool args. */
export type WorkspaceToolContext = {
  requestId: string;
  userId: string;
  chatId: string | null;
  /** Optional validated active client from prior turns (server-set). */
  activeClientId?: string | null;
};

export type WorkspaceToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export type WorkspaceToolResult = {
  ok: boolean;
  tool: string;
  toolCallId: string;
  errorCode: WorkspaceToolErrorCode | null;
  errorMessage: string | null;
  /** JSON-serializable payload returned to Astra as tool role content. */
  data: unknown;
  latencyMs: number;
  resultCount: number | null;
  outputChars: number;
  cacheHit: boolean;
  /** Provenance tags for final source set (CLIENT / KB). */
  sourceTags: string[];
};

export type WorkspaceToolDefinition = {
  name: WorkspaceToolName;
  description: string;
  /** OpenAI/OpenRouter function parameters JSON Schema. */
  parameters: Record<string, unknown>;
  uiStatusLabel: string;
  execute: (
    args: unknown,
    ctx: WorkspaceToolContext,
  ) => Promise<Omit<WorkspaceToolResult, "toolCallId" | "cacheHit">>;
};

export type WorkspaceToolLoopLimits = {
  maxToolRounds: number;
  maxToolCallsPerTurn: number;
  maxParallelCalls: number;
  totalToolDataBudgetChars: number;
  maxWallClockMs: number;
};

export const DEFAULT_TOOL_LOOP_LIMITS: WorkspaceToolLoopLimits = {
  maxToolRounds: 6,
  maxToolCallsPerTurn: 12,
  maxParallelCalls: 3,
  totalToolDataBudgetChars: 48_000,
  maxWallClockMs: 45_000,
};

export type WorkspaceToolLoopStopReason =
  | "final_answer"
  | "max_rounds"
  | "max_calls"
  | "data_budget"
  | "timeout"
  | "model_error"
  | "empty_response"
  | "fallback";

export type WorkspaceToolCallTraceEntry = {
  toolName: string;
  toolCallId?: string;
  ok: boolean;
  errorCode: WorkspaceToolErrorCode | null;
  latencyMs: number;
  resultCount: number | null;
  outputChars: number;
  cacheHit: boolean;
};
