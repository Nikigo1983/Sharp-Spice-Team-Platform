/**
 * Structural sanitization for agent tool telemetry.
 * Enforces allowlisted fields only — never args/results/PII.
 */

import type {
  WorkspaceToolCallTraceEntry,
  WorkspaceToolErrorCode,
} from "@/lib/ai/workspace-tools/types";

const ALLOWED_TRACE_KEYS = new Set([
  "toolName",
  "toolCallId",
  "ok",
  "errorCode",
  "latencyMs",
  "resultCount",
  "outputChars",
  "cacheHit",
  "finishReason",
]);

export type SafeToolCallTrace = {
  toolName: string;
  toolCallId?: string;
  ok: boolean;
  errorCode: WorkspaceToolErrorCode | string | null;
  latencyMs: number;
  resultCount: number | null;
  outputChars: number;
  cacheHit: boolean;
  finishReason?: string | null;
};

/** Strip any accidental extra keys before logging/tracing. */
export function sanitizeToolCallTraceEntry(
  entry: WorkspaceToolCallTraceEntry & Record<string, unknown>,
): SafeToolCallTrace {
  return {
    toolName: String(entry.toolName ?? "unknown").slice(0, 80),
    toolCallId:
      typeof entry.toolCallId === "string"
        ? entry.toolCallId.slice(0, 120)
        : undefined,
    ok: Boolean(entry.ok),
    errorCode: (entry.errorCode as WorkspaceToolErrorCode | null) ?? null,
    latencyMs:
      typeof entry.latencyMs === "number" && Number.isFinite(entry.latencyMs)
        ? Math.max(0, Math.round(entry.latencyMs))
        : 0,
    resultCount:
      typeof entry.resultCount === "number" ? entry.resultCount : null,
    outputChars:
      typeof entry.outputChars === "number" ? entry.outputChars : 0,
    cacheHit: Boolean(entry.cacheHit),
  };
}

export function sanitizeToolCallTraceList(
  entries: Array<Record<string, unknown> | WorkspaceToolCallTraceEntry>,
): SafeToolCallTrace[] {
  return entries.map((entry) =>
    sanitizeToolCallTraceEntry(
      entry as WorkspaceToolCallTraceEntry & Record<string, unknown>,
    ),
  );
}

export function assertSafeToolTracePayload(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return false;
    for (const key of Object.keys(entry as object)) {
      if (!ALLOWED_TRACE_KEYS.has(key)) return false;
    }
    const record = entry as Record<string, unknown>;
    if (
      "arguments" in record ||
      "args" in record ||
      "data" in record ||
      "result" in record ||
      "snippet" in record
    ) {
      return false;
    }
  }
  return true;
}
