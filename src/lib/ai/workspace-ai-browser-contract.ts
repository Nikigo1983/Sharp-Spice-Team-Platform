/**
 * Production UI ↔ /api/ai-workspace browser contract helpers.
 * Route encode + AiWorkspaceView SSE parse + Turn POST body must share this
 * module so regressions exercise the real wire format (not hand-rolled mocks).
 *
 * Client-safe: no node:crypto / server-only imports.
 */

import type { ClientContext } from "@/lib/ai/client-context";
import type { ClientListContinuationState } from "@/lib/ai/client-list-continuation";
import type { WorkspaceResponseMode } from "@/lib/ai/workspace-assistant";
import {
  mergeStreamCaseMemoryUpdate,
  sanitizeCaseMemory,
  type WorkspaceCaseMemory,
} from "@/lib/ai/workspace-case-memory";
import { clientRefFromCaseMemory } from "@/lib/ai/conversation-client-lock";

export type WorkspaceAiSseEventName =
  | "delta"
  | "status"
  | "meta"
  | "done"
  | "error";

/** Exact SSE frame shape used by /api/ai-workspace. */
export function encodeWorkspaceAiSseEvent(
  event: WorkspaceAiSseEventName,
  data: unknown,
): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Meta payload encoder — ownership rule matches route.ts:
 * omit `caseMemory` key when unset so early meta cannot wipe a lock.
 */
export function encodeWorkspaceAiSseMetaPayload(params: {
  requestId: string;
  sources: string[];
  demo: boolean;
  pendingClientCandidates?: ClientContext[] | null;
  needsClientSelection?: boolean;
  clientListContinuation?: ClientListContinuationState | null;
  conversationSummary?: string | null;
  summaryThroughMessageCount?: number | null;
  caseMemory?: WorkspaceCaseMemory | null;
}): Record<string, unknown> {
  return {
    requestId: params.requestId,
    sources: params.sources,
    demo: params.demo,
    pendingClientCandidates: params.pendingClientCandidates ?? null,
    needsClientSelection: params.needsClientSelection,
    clientListContinuation: params.clientListContinuation ?? null,
    conversationSummary: params.conversationSummary ?? null,
    summaryThroughMessageCount: params.summaryThroughMessageCount ?? null,
    ...(params.caseMemory !== undefined
      ? { caseMemory: params.caseMemory }
      : {}),
  };
}

export function encodeWorkspaceAiSseMeta(params: {
  requestId: string;
  sources: string[];
  demo: boolean;
  pendingClientCandidates?: ClientContext[] | null;
  needsClientSelection?: boolean;
  clientListContinuation?: ClientListContinuationState | null;
  conversationSummary?: string | null;
  summaryThroughMessageCount?: number | null;
  caseMemory?: WorkspaceCaseMemory | null;
}): string {
  return encodeWorkspaceAiSseEvent(
    "meta",
    encodeWorkspaceAiSseMetaPayload(params),
  );
}

/** Exact block splitter used by AiWorkspaceView.consumeSseResponse. */
export function splitWorkspaceAiSseBlocks(buffer: string): {
  complete: string[];
  rest: string;
} {
  const chunks = buffer.split("\n\n");
  const rest = chunks.pop() ?? "";
  return { complete: chunks, rest };
}

/** Exact event/data line extraction used by AiWorkspaceView. */
export function parseWorkspaceAiSseBlock(
  chunk: string,
): { event: string; rawData: string } | null {
  const lines = chunk.split("\n");
  const eventLine = lines.find((line) => line.startsWith("event:"));
  const dataLine = lines.find((line) => line.startsWith("data:"));
  if (!eventLine || !dataLine) return null;
  const event = eventLine.slice(6).trim();
  const rawData = dataLine.slice(5).trim();
  if (!rawData) return null;
  return { event, rawData };
}

/**
 * Apply one SSE event to stream-local caseMemory — same rules as
 * AiWorkspaceView meta handling (mergeStreamCaseMemoryUpdate).
 */
export function reduceWorkspaceAiSseCaseMemory(
  current: WorkspaceCaseMemory | null | undefined,
  event: string,
  rawData: string,
): WorkspaceCaseMemory | null | undefined {
  if (event !== "meta") return current;
  const meta = JSON.parse(rawData) as {
    caseMemory?: WorkspaceCaseMemory | null;
  };
  if (meta.caseMemory === undefined) return current;
  return mergeStreamCaseMemoryUpdate(current, meta.caseMemory, true);
}

/** Consume a full SSE transcript into the UI stream caseMemory accumulator. */
export function reduceWorkspaceAiSseTranscriptCaseMemory(
  sseText: string,
): WorkspaceCaseMemory | null | undefined {
  let streamCaseMemory: WorkspaceCaseMemory | null | undefined;
  const { complete } = splitWorkspaceAiSseBlocks(sseText);
  for (const block of complete) {
    const parsed = parseWorkspaceAiSseBlock(block);
    if (!parsed) continue;
    streamCaseMemory = reduceWorkspaceAiSseCaseMemory(
      streamCaseMemory,
      parsed.event,
      parsed.rawData,
    );
  }
  return streamCaseMemory;
}

/**
 * Live ClientRef store used by AiWorkspaceView send().
 * Ref is updated on each authoritative SSE meta — next send() must not wait
 * for React render or persistChat.
 */
export type LiveCaseMemoryController = {
  get: () => WorkspaceCaseMemory | null;
  set: (next: WorkspaceCaseMemory | null) => void;
  /** Apply one SSE meta caseMemory update immediately (canonical merge). */
  applySseMeta: (
    incoming: WorkspaceCaseMemory | null | undefined,
    keyPresent: boolean,
  ) => WorkspaceCaseMemory | null;
};

export function createLiveCaseMemoryController(
  initial: WorkspaceCaseMemory | null = null,
): LiveCaseMemoryController {
  let value: WorkspaceCaseMemory | null = initial;
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
    applySseMeta: (incoming, keyPresent) => {
      const next = mergeStreamCaseMemoryUpdate(value, incoming, keyPresent);
      if (keyPresent && next !== undefined) {
        value = next;
      }
      return value;
    },
  };
}

/**
 * Production live path: fold SSE transcript into a live controller as each
 * meta arrives (same timing as AiWorkspaceView before persistChat).
 */
export function reduceWorkspaceAiSseTranscriptToLiveCaseMemory(
  sseText: string,
  live: LiveCaseMemoryController,
): WorkspaceCaseMemory | null {
  const { complete } = splitWorkspaceAiSseBlocks(sseText);
  for (const block of complete) {
    const parsed = parseWorkspaceAiSseBlock(block);
    if (!parsed || parsed.event !== "meta") continue;
    const meta = JSON.parse(parsed.rawData) as {
      caseMemory?: WorkspaceCaseMemory | null;
    };
    if (meta.caseMemory === undefined) continue;
    live.applySseMeta(meta.caseMemory, true);
  }
  return live.get();
}

export type WorkspaceAiTurnRequestInput = {
  message: string;
  history: Array<{ role: string; content: string }>;
  mode: WorkspaceResponseMode;
  chatId: string | null;
  conversationSummary?: string | null;
  caseMemory?: WorkspaceCaseMemory | null;
  pendingClientCandidates?: ClientContext[];
  clientListContinuation?: ClientListContinuationState | null;
};

/**
 * Exact POST /api/ai-workspace JSON body builder used by AiWorkspaceView.send.
 * `caseMemory: null` → key omitted (JSON.stringify drops undefined).
 */
export function buildWorkspaceAiTurnRequestBody(
  input: WorkspaceAiTurnRequestInput,
): Record<string, unknown> {
  return {
    message: input.message,
    history: input.history,
    mode: input.mode,
    chatId: input.chatId,
    conversationSummary: input.conversationSummary ?? undefined,
    caseMemory: input.caseMemory ?? undefined,
    pendingClientCandidates: input.pendingClientCandidates?.length
      ? input.pendingClientCandidates
      : undefined,
    clientListContinuation: input.clientListContinuation ?? undefined,
  };
}

export function serializeWorkspaceAiTurnRequest(
  input: WorkspaceAiTurnRequestInput,
): string {
  return JSON.stringify(buildWorkspaceAiTurnRequestBody(input));
}

/** Route-faithful caseMemory parse from POST JSON. */
export function parseWorkspaceAiTurnRequestCaseMemory(
  bodyJson: string,
): WorkspaceCaseMemory | null {
  const body = JSON.parse(bodyJson) as { caseMemory?: unknown };
  return sanitizeCaseMemory(body.caseMemory ?? null);
}

export function caseMemoryHasClientRef(
  memory: WorkspaceCaseMemory | null | undefined,
): boolean {
  return Boolean(clientRefFromCaseMemory(memory ?? null));
}

export type ClientRefLifecycleCheckpoint =
  | "SERVER_REQUEST_BODY_CLIENTREF"
  | "SERVER_AFTER_CASEMEMORY_RECOVERY"
  | "SERVER_PREPARE_INPUT_CLIENTREF"
  | "SERVER_AFTER_UNIQUE_RESOLUTION"
  | "SERVER_BEFORE_FIRST_SSE_CLIENTREF"
  | "SERVER_FINAL_SSE_CLIENTREF"
  | "UI_SSE_META_RECEIVED_CLIENTREF"
  | "UI_AFTER_COMMIT_CASEMEMORY"
  | "UI_LIVE_REF_AFTER_META"
  | "UI_AFTER_STREAM_COMPLETE_CLIENTREF"
  | "UI_BEFORE_TURN2_SERIALIZE_CLIENTREF"
  | "UI_TURN2_BODY_CLIENTREF"
  | "TURN2_SERVER_REQUEST_CLIENTREF"
  | "TURN2_AFTER_RECOVERY_CLIENTREF"
  | "TURN2_PREPARE_LOCKED_CLIENTREF"
  | "TURN2_PRONOUN_DEBT_GATE_CLIENTREF"
  // Legacy aliases (still logged by older call sites during migration)
  | "SERVER_RESOLVED_CLIENTREF"
  | "SSE_CLIENTREF_EMITTED"
  | "SERVER_TURN_RECEIVED_CLIENTREF"
  | "UI_CLIENTREF_AFTER_META"
  | "UI_CLIENTREF_AFTER_STREAM_COMPLETE"
  | "TURN2_POST_CLIENTREF";

/**
 * Preview-only browser ClientRef lifecycle tracing.
 * Requires non-production deploy context AND explicit public flag.
 * NEXT_PUBLIC_VERCEL_ENV=production can never enable.
 */
export function isClientRefLifecycleBrowserTraceEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === "production") return false;
  const nonProdDeploy =
    process.env.NEXT_PUBLIC_VERCEL_ENV === "preview" ||
    process.env.NEXT_PUBLIC_VERCEL_ENV === "development" ||
    (!process.env.NEXT_PUBLIC_VERCEL_ENV &&
      process.env.NODE_ENV !== "production");
  return (
    nonProdDeploy &&
    process.env.NEXT_PUBLIC_AI_CLIENTREF_LIFECYCLE_TRACE === "1"
  );
}

export function logClientRefLifecycleBrowserTrace(params: {
  checkpoint: ClientRefLifecycleCheckpoint;
  requestId?: string | null;
  turn?: number | null;
  hasClientRef: boolean;
  sseEvent?: string | null;
  uiTransition?: string | null;
}): void {
  if (!isClientRefLifecycleBrowserTraceEnabled()) return;
  // Booleans + checkpoint names only — never UUID / PII.
  console.info("[ai_clientref_lifecycle_trace]", {
    checkpoint: params.checkpoint,
    requestId: params.requestId ?? null,
    turn: params.turn ?? null,
    hasClientRef: params.hasClientRef,
    clientRefPresence: params.hasClientRef ? "PRESENT" : "ABSENT",
    sseEvent: params.sseEvent ?? null,
    uiTransition: params.uiTransition ?? null,
  });
}
