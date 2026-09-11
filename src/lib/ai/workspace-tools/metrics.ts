/**
 * Low-cardinality rollout counters for AI Workspace agent tools.
 * Never use user IDs, emails, or tool arguments as labels.
 */

export type WorkspaceToolMetricName =
  | "tool_call_requested"
  | "tool_call_success"
  | "tool_call_error"
  | "tool_json_parse_error"
  | "unknown_tool"
  | "duplicate_tool_blocked"
  | "max_rounds_reached"
  | "second_round_failure"
  | "tool_loop_latency_ms_sum"
  | "tool_loop_latency_ms_count"
  | "agent_path_entered"
  | "agent_path_skipped_ineligible";

const counters = new Map<WorkspaceToolMetricName, number>();

export function resetWorkspaceToolMetrics(): void {
  counters.clear();
}

export function incrementWorkspaceToolMetric(
  name: WorkspaceToolMetricName,
  by = 1,
): void {
  if (!Number.isFinite(by) || by === 0) return;
  counters.set(name, (counters.get(name) ?? 0) + by);
}

export function observeToolLoopLatencyMs(latencyMs: number): void {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) return;
  incrementWorkspaceToolMetric("tool_loop_latency_ms_sum", latencyMs);
  incrementWorkspaceToolMetric("tool_loop_latency_ms_count", 1);
}

export function getWorkspaceToolMetricsSnapshot(): Record<
  WorkspaceToolMetricName,
  number
> {
  const names: WorkspaceToolMetricName[] = [
    "tool_call_requested",
    "tool_call_success",
    "tool_call_error",
    "tool_json_parse_error",
    "unknown_tool",
    "duplicate_tool_blocked",
    "max_rounds_reached",
    "second_round_failure",
    "tool_loop_latency_ms_sum",
    "tool_loop_latency_ms_count",
    "agent_path_entered",
    "agent_path_skipped_ineligible",
  ];
  const out = {} as Record<WorkspaceToolMetricName, number>;
  for (const name of names) {
    out[name] = counters.get(name) ?? 0;
  }
  return out;
}
