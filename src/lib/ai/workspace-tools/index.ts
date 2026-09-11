export type {
  WorkspaceToolName,
  WorkspaceToolErrorCode,
  WorkspaceToolContext,
  WorkspaceToolCall,
  WorkspaceToolResult,
  WorkspaceToolDefinition,
  WorkspaceToolLoopLimits,
  WorkspaceToolLoopStopReason,
  WorkspaceToolCallTraceEntry,
} from "@/lib/ai/workspace-tools/types";

export { DEFAULT_TOOL_LOOP_LIMITS } from "@/lib/ai/workspace-tools/types";

export {
  WORKSPACE_TOOL_REGISTRY,
  isRegisteredWorkspaceTool,
  getWorkspaceToolDefinition,
  buildOpenRouterToolDefinitions,
  toolUiStatusLabel,
} from "@/lib/ai/workspace-tools/registry";

export {
  executeWorkspaceToolCall,
  createToolExecutorState,
  toolResultToMessageContent,
  DEFAULT_TOOL_EXECUTION_TIMEOUT_MS,
} from "@/lib/ai/workspace-tools/executor";

export {
  runWorkspaceAgentToolLoop,
  type AgentLoopResult,
  type AgentToolStatusEvent,
} from "@/lib/ai/workspace-tools/tool-loop";

export {
  buildWorkspaceAgentMessages,
  WORKSPACE_AGENT_SYSTEM_ADDON,
} from "@/lib/ai/workspace-tools/agent-prompt";

export { StreamToolCallAccumulator } from "@/lib/ai/workspace-tools/stream-tool-calls";

export {
  projectSafeClient,
  executeSearchClients,
  executeGetClient,
  executeGetCaseContext,
} from "@/lib/ai/workspace-tools/client-tools";

export { executeSearchKnowledgeBase } from "@/lib/ai/workspace-tools/kb-tools";

export {
  validateSearchClientsArgs,
  validateGetClientArgs,
  validateSearchKnowledgeBaseArgs,
} from "@/lib/ai/workspace-tools/schemas";

export {
  deepRedactToolPayload,
  isDeniedClientFieldKey,
  CLIENT_TOOL_DENYLIST,
  stripForbiddenAuthArgs,
} from "@/lib/ai/workspace-tools/security";

export {
  incrementWorkspaceToolMetric,
  resetWorkspaceToolMetrics,
  getWorkspaceToolMetricsSnapshot,
  observeToolLoopLatencyMs,
} from "@/lib/ai/workspace-tools/metrics";

export {
  sanitizeToolCallTraceEntry,
  sanitizeToolCallTraceList,
  assertSafeToolTracePayload,
} from "@/lib/ai/workspace-tools/trace-sanitize";
