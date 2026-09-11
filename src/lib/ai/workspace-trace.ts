import { randomUUID } from "node:crypto";
import { redactForLogging, redactSensitiveText } from "@/lib/ai/context-redaction";
import type { WorkspaceQueryIntent } from "@/lib/ai/query-intent";
import type { WorkspaceRouterDecision } from "@/lib/ai/workspace-router-types";
import { sanitizeToolCallTraceList } from "@/lib/ai/workspace-tools/trace-sanitize";

export type KbGroundingState =
  | "KB_SKIPPED"
  | "KB_CATALOG_ONLY"
  | "KB_CONTENT_AVAILABLE"
  | "KB_EMPTY"
  | "KB_ERROR";

export type AiFallbackReason =
  | "NONE"
  | "KB_NOT_CONFIGURED"
  | "KB_EMPTY"
  | "KB_CATALOG_ONLY_CONTENT_REQUIRED"
  | "KB_RETRIEVAL_ERROR"
  | "CONTEXT_BUILD_ERROR"
  | "OPENROUTER_ERROR"
  | "MODEL_EMPTY_RESPONSE"
  | "CLIENT_SEARCH_ERROR"
  | "INTENT_ERROR"
  | "ROUTER_MODEL_ERROR"
  | "ROUTER_INVALID_RESPONSE"
  | "ROUTER_LOW_CONFIDENCE"
  | "ROUTER_FALLBACK_USED"
  | "UNKNOWN";

export type DriveRetrievalMode =
  | "skipped"
  | "catalog"
  | "content"
  | "full_export"
  | "unconfigured"
  | "failed";

export type KbMatchReason =
  | "filename"
  | "path"
  | "content"
  | "combined";

export type DriveSelectedFileMeta = {
  id: string;
  path: string;
  score: number;
  hasContent: boolean;
  matchReasons?: KbMatchReason[];
  extractionOk?: boolean;
};

export type DriveRetrievalMeta = {
  source: "knowledge_base" | "emigrant_drive";
  attempted: boolean;
  configured: boolean;
  mode: DriveRetrievalMode;
  groundingState: KbGroundingState;
  candidateFileCount: number;
  selectedFiles: DriveSelectedFileMeta[];
  contentRetrieved: boolean;
  usefulContextEmpty: boolean;
  textCharCount: number;
  errorMessage?: string;
  /** AI-02: lexical retrieval diagnostics */
  queryTokens?: string[];
  filenameSearchAttempted?: boolean;
  contentSearchAttempted?: boolean;
  selectedCount?: number;
  rejectedOutsideRootCount?: number;
  retrievalLatencyMs?: number;
};

export type WorkspaceAiTrace = {
  requestId: string;
  timestamp: string;
  intent: WorkspaceQueryIntent | null;
  selectedRoutes: string[];
  routingMethod: "DIRECT" | "RULE" | "AI" | "FALLBACK" | null;
  routingIntentLabel: string | null;
  routingConfidence: number | null;
  routingReason: string | null;
  routerModelRequested: string | null;
  routingFallbackUsed: boolean;
  needsKb: boolean;
  needsKbFullText: boolean;
  needsClients: boolean;
  needsEmigrantDrive: boolean;
  needsEmigrantDesk: boolean;
  needsFormgrid: boolean;
  kbMode: DriveRetrievalMode | "skipped";
  kbConfigured: boolean;
  kbGroundingState: KbGroundingState;
  kbRetrievedFileCount: number;
  kbSelectedFiles: DriveSelectedFileMeta[];
  kbRetrievalScores: number[];
  kbContextChars: number;
  kbQueryTokens: string[];
  kbFilenameSearchAttempted: boolean;
  kbContentSearchAttempted: boolean;
  kbRejectedOutsideRootCount: number;
  kbRetrievalLatencyMs: number | null;
  emigrantDriveMode: DriveRetrievalMode | "skipped";
  emigrantDriveFileCount: number;
  clientContextCount: number;
  clientCandidatesCount: number;
  historyTurnCount: number;
  contextCharsEstimate: number;
  clientContextChars: number;
  requestedModel: string | null;
  returnedModel: string | "NOT_AVAILABLE";
  auxiliaryModel: string | null;
  usageInputTokens: number | "NOT_AVAILABLE";
  usageOutputTokens: number | "NOT_AVAILABLE";
  openRouterOk: boolean | null;
  fallbackActivated: boolean;
  fallbackReason: AiFallbackReason;
  responseOk: boolean;
  latencyMs: {
    prepare?: number;
    context?: number;
    model?: number;
    total?: number;
  };
  notes: string[];
  /** Phase 1 agent tool-calling observability (safe). */
  agentMode: boolean;
  astraRounds: number;
  toolCallCount: number;
  toolCalls: Array<{
    toolName: string;
    toolCallId?: string;
    ok: boolean;
    errorCode: string | null;
    latencyMs: number;
    resultCount: number | null;
    outputChars: number;
    cacheHit: boolean;
  }>;
  loopStopReason: string | null;
  totalToolChars: number;
  finalSourceSet: string[];
  astraCalled: boolean;
};

const TRACE_STORE_MAX = 200;
const recentTraces = new Map<string, WorkspaceAiTrace>();

export function createAiRequestId(): string {
  return randomUUID();
}

export function createEmptyWorkspaceAiTrace(
  requestId: string,
): WorkspaceAiTrace {
  return {
    requestId,
    timestamp: new Date().toISOString(),
    intent: null,
    selectedRoutes: [],
    routingMethod: null,
    routingIntentLabel: null,
    routingConfidence: null,
    routingReason: null,
    routerModelRequested: null,
    routingFallbackUsed: false,
    needsKb: false,
    needsKbFullText: false,
    needsClients: false,
    needsEmigrantDrive: false,
    needsEmigrantDesk: false,
    needsFormgrid: false,
    kbMode: "skipped",
    kbConfigured: false,
    kbGroundingState: "KB_SKIPPED",
    kbRetrievedFileCount: 0,
    kbSelectedFiles: [],
    kbRetrievalScores: [],
    kbContextChars: 0,
    kbQueryTokens: [],
    kbFilenameSearchAttempted: false,
    kbContentSearchAttempted: false,
    kbRejectedOutsideRootCount: 0,
    kbRetrievalLatencyMs: null,
    emigrantDriveMode: "skipped",
    emigrantDriveFileCount: 0,
    clientContextCount: 0,
    clientCandidatesCount: 0,
    historyTurnCount: 0,
    contextCharsEstimate: 0,
    clientContextChars: 0,
    requestedModel: null,
    returnedModel: "NOT_AVAILABLE",
    auxiliaryModel: null,
    usageInputTokens: "NOT_AVAILABLE",
    usageOutputTokens: "NOT_AVAILABLE",
    openRouterOk: null,
    fallbackActivated: false,
    fallbackReason: "NONE",
    responseOk: false,
    latencyMs: {},
    notes: [],
    agentMode: false,
    astraRounds: 0,
    toolCallCount: 0,
    toolCalls: [],
    loopStopReason: null,
    totalToolChars: 0,
    finalSourceSet: [],
    astraCalled: false,
  };
}

export function applyIntentToTrace(
  trace: WorkspaceAiTrace,
  intent: WorkspaceQueryIntent,
): void {
  trace.intent = { ...intent };
  trace.needsKb = intent.needsKb;
  trace.needsKbFullText = intent.needsKbFullText;
  trace.needsClients = intent.needsClients;
  trace.needsEmigrantDrive = intent.needsEmigrantDrive;
  trace.needsEmigrantDesk = intent.needsEmigrantDesk;
  trace.needsFormgrid = intent.needsFormgrid;
  trace.selectedRoutes = buildSelectedRoutes(intent);
}

export function applyRoutingDecisionToTrace(
  trace: WorkspaceAiTrace,
  decision: WorkspaceRouterDecision,
): void {
  applyIntentToTrace(trace, decision.workspaceIntent);
  trace.routingMethod = decision.method;
  trace.routingIntentLabel = decision.intentLabel;
  trace.routingConfidence = decision.confidence;
  trace.routingReason = decision.reason;
  trace.routerModelRequested = decision.routerModelRequested;
  trace.routingFallbackUsed = decision.fallbackUsed;
  if (decision.fallbackUsed && decision.fallbackReason !== "NONE") {
    trace.fallbackActivated = true;
    if (trace.fallbackReason === "NONE") {
      trace.fallbackReason = decision.fallbackReason;
    }
  }
  trace.selectedRoutes =
    decision.sources.length > 0
      ? [...decision.sources]
      : buildSelectedRoutes(decision.workspaceIntent);
}

export function buildSelectedRoutes(intent: WorkspaceQueryIntent): string[] {
  const routes: string[] = [];
  if (intent.needsKb) routes.push("knowledge_base");
  if (intent.needsEmigrantDrive) routes.push("emigrant_drive");
  if (intent.needsClients) routes.push("clients");
  if (intent.needsEmigrantDesk) routes.push("emigrant_desk");
  if (intent.needsFormgrid) routes.push("formgrid");
  if (intent.fastClientLookup) routes.push("fast_client_lookup");
  return routes.length > 0 ? routes : ["general"];
}

export function skippedDriveMeta(
  source: DriveRetrievalMeta["source"],
): DriveRetrievalMeta {
  return {
    source,
    attempted: false,
    configured: false,
    mode: "skipped",
    groundingState: "KB_SKIPPED",
    candidateFileCount: 0,
    selectedFiles: [],
    contentRetrieved: false,
    usefulContextEmpty: true,
    textCharCount: 0,
  };
}

export function estimateChars(...parts: Array<string | null | undefined>): number {
  return parts.reduce((sum, part) => sum + (part?.length ?? 0), 0);
}

export function rememberWorkspaceAiTrace(trace: WorkspaceAiTrace): void {
  recentTraces.set(trace.requestId, trace);
  if (recentTraces.size > TRACE_STORE_MAX) {
    const oldest = recentTraces.keys().next().value;
    if (oldest) recentTraces.delete(oldest);
  }
}

export function getWorkspaceAiTrace(
  requestId: string,
): WorkspaceAiTrace | null {
  return recentTraces.get(requestId) ?? null;
}

/** Developer-safe JSON for logs / local debug lookup by requestId. */
export function serializeWorkspaceAiTraceForLog(
  trace: WorkspaceAiTrace,
): Record<string, unknown> {
  const payload = {
    requestId: trace.requestId,
    timestamp: trace.timestamp,
    intent: trace.intent,
    selectedRoutes: trace.selectedRoutes,
    routingMethod: trace.routingMethod,
    routingIntentLabel: trace.routingIntentLabel,
    routingConfidence: trace.routingConfidence,
    routingReason: trace.routingReason,
    routerModelRequested: trace.routerModelRequested,
    routingFallbackUsed: trace.routingFallbackUsed,
    needsKb: trace.needsKb,
    needsKbFullText: trace.needsKbFullText,
    needsClients: trace.needsClients,
    needsEmigrantDrive: trace.needsEmigrantDrive,
    needsEmigrantDesk: trace.needsEmigrantDesk,
    needsFormgrid: trace.needsFormgrid,
    kbMode: trace.kbMode,
    kbConfigured: trace.kbConfigured,
    kbGroundingState: trace.kbGroundingState,
    kbRetrievedFileCount: trace.kbRetrievedFileCount,
    kbSelectedFiles: trace.kbSelectedFiles.map((file) => ({
      id: file.id,
      path: file.path,
      score: file.score,
      hasContent: file.hasContent,
    })),
    kbRetrievalScores: trace.kbRetrievalScores,
    kbContextChars: trace.kbContextChars,
    kbQueryTokens: trace.kbQueryTokens,
    kbFilenameSearchAttempted: trace.kbFilenameSearchAttempted,
    kbContentSearchAttempted: trace.kbContentSearchAttempted,
    kbRejectedOutsideRootCount: trace.kbRejectedOutsideRootCount,
    kbRetrievalLatencyMs: trace.kbRetrievalLatencyMs,
    kbSelectedMatchReasons: trace.kbSelectedFiles.map((file) => ({
      id: file.id,
      path: file.path,
      score: file.score,
      matchReasons: file.matchReasons ?? [],
      extractionOk: file.extractionOk ?? file.hasContent,
    })),
    emigrantDriveMode: trace.emigrantDriveMode,
    emigrantDriveFileCount: trace.emigrantDriveFileCount,
    clientContextCount: trace.clientContextCount,
    clientCandidatesCount: trace.clientCandidatesCount,
    historyTurnCount: trace.historyTurnCount,
    contextCharsEstimate: trace.contextCharsEstimate,
    clientContextChars: trace.clientContextChars,
    requestedModel: trace.requestedModel,
    returnedModel: trace.returnedModel,
    auxiliaryModel: trace.auxiliaryModel,
    usageInputTokens: trace.usageInputTokens,
    usageOutputTokens: trace.usageOutputTokens,
    openRouterOk: trace.openRouterOk,
    fallbackActivated: trace.fallbackActivated,
    fallbackReason: trace.fallbackReason,
    responseOk: trace.responseOk,
    latencyMs: trace.latencyMs,
    notes: trace.notes,
    agentMode: trace.agentMode,
    astraRounds: trace.astraRounds,
    toolCallCount: trace.toolCallCount,
    toolCalls: sanitizeToolCallTraceList(trace.toolCalls),
    loopStopReason: trace.loopStopReason,
    totalToolChars: trace.totalToolChars,
    finalSourceSet: trace.finalSourceSet,
    astraCalled: trace.astraCalled,
  };

  return redactForLogging(payload) as Record<string, unknown>;
}

export function logWorkspaceAiTrace(trace: WorkspaceAiTrace): void {
  const safe = serializeWorkspaceAiTraceForLog(trace);
  console.info(
    `[ai-workspace-trace] ${trace.requestId}`,
    redactSensitiveText(JSON.stringify(safe)),
  );
  rememberWorkspaceAiTrace(trace);
}

export function assertTraceHasNoSecrets(
  serialized: Record<string, unknown>,
  secretSamples: string[],
): boolean {
  const blob = JSON.stringify(serialized).toLowerCase();
  for (const sample of secretSamples) {
    const trimmed = sample.trim();
    if (trimmed.length >= 8 && blob.includes(trimmed.toLowerCase())) {
      return false;
    }
  }
  if (blob.includes("authorization")) return false;
  if (blob.includes("bearer ")) return false;
  return true;
}
