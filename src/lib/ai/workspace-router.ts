import {
  isEmigrantDrivePrimaryQuery,
  isPassportNumberLookupQuery,
} from "@/lib/ai/query-intent-signals";
import { createChatCompletionResult } from "@/lib/ai/openai";
import { isAiConfigured } from "@/lib/ai/config";
import { getWorkspaceRouterModelId } from "@/lib/ai/models";
import {
  routeWorkspaceQueryByRules,
  softAuthoritativeFallbackSources,
  workspaceIntentFromAiClassification,
} from "@/lib/ai/workspace-router-rules";

export { softAuthoritativeFallbackSources };
import {
  isWorkspaceRouteSource,
  ROUTER_CONFIDENCE_HIGH,
  ROUTER_CONFIDENCE_LOW,
  type AiRouterClassification,
  type RoutingMethod,
  type WorkspaceRouteIntentLabel,
  type WorkspaceRouteSource,
  type WorkspaceRouterDecision,
} from "@/lib/ai/workspace-router-types";
import type { WorkspaceQueryIntent } from "@/lib/ai/query-intent";

const VALID_INTENTS = new Set<WorkspaceRouteIntentLabel>([
  "knowledge",
  "client_lookup",
  "client_documents",
  "client_list",
  "desk_status",
  "formgrid",
  "generation",
  "multi",
  "direct",
  "unknown",
]);

const ROUTER_SYSTEM_PROMPT = `You classify internal Sharp & Spice manager questions for data-source routing.
Return ONLY valid JSON (no markdown):
{
  "intent": "knowledge|client_lookup|client_documents|client_list|desk_status|formgrid|generation|multi|unknown",
  "sources": ["knowledge_base"|"clients"|"emigrant_drive"|"emigrant_desk"|"formgrid"],
  "requires_authoritative_data": boolean,
  "confidence": number,
  "reason": "short_label"
}

Source semantics:
- knowledge_base: program rules, ВНЖ/digital nomad requirements, immigration procedures, policies (NOT a named client's files)
- clients: CRM Google Sheets client records (status, passport number, booking, lists)
- emigrant_drive: uploaded files/scans for a specific client in the ЭМИГРАНТ Drive folder
- emigrant_desk: Emigrant Croatia Desk case status in the cabinet product
- formgrid: new lead questionnaires / Formgrid rows

Rules:
- General "какие документы нужны для ВНЖ" → knowledge_base only
- "какие документы загрузил Иван" → clients + emigrant_drive
- Missing docs for a named client vs program rules → clients + emigrant_drive + knowledge_base
- Named client + checklist / compare / eligibility / requirements → clients + emigrant_drive + knowledge_base
- Named client booking/address/status/passport/phone/email → clients
- Pure writing/rewrite/translate with no client facts → sources []
- Never invent sources; prefer fewer correct sources over loading all
- confidence 0..1; reason is a short snake_case label, not a long explanation`;

export function getWorkspaceRouterModel(): string {
  return getWorkspaceRouterModelId();
}

/** Exported for deterministic malformed-JSON tests. */
export function parseAiRouterJson(content: string): AiRouterClassification | null {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]) as Partial<AiRouterClassification>;
    if (typeof raw.intent !== "string" || !VALID_INTENTS.has(raw.intent as WorkspaceRouteIntentLabel)) {
      return null;
    }
    if (!Array.isArray(raw.sources)) return null;
    const sources: WorkspaceRouteSource[] = [];
    for (const item of raw.sources) {
      if (typeof item !== "string" || !isWorkspaceRouteSource(item)) {
        return null; // unknown source → reject whole payload
      }
      if (!sources.includes(item)) sources.push(item);
    }
    const confidence =
      typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
        ? Math.min(1, Math.max(0, raw.confidence))
        : null;
    if (confidence === null) return null;
    if (typeof raw.requires_authoritative_data !== "boolean") return null;
    const reason =
      typeof raw.reason === "string" && raw.reason.trim()
        ? raw.reason.trim().slice(0, 80)
        : "ai_classified";

    return {
      intent: raw.intent as WorkspaceRouteIntentLabel,
      sources,
      requires_authoritative_data: raw.requires_authoritative_data,
      confidence,
      reason,
    };
  } catch {
    return null;
  }
}

async function classifyWithRouterModel(
  query: string,
): Promise<
  | { ok: true; classification: AiRouterClassification; model: string }
  | { ok: false; reason: "ROUTER_MODEL_ERROR" | "ROUTER_INVALID_RESPONSE"; model: string | null }
> {
  if (!isAiConfigured()) {
    return { ok: false, reason: "ROUTER_MODEL_ERROR", model: null };
  }
  const model = getWorkspaceRouterModel();
  const result = await createChatCompletionResult(
    [
      { role: "system", content: ROUTER_SYSTEM_PROMPT },
      { role: "user", content: query },
    ],
    {
      temperature: 0,
      maxTokens: 300,
      model,
    },
  );
  if (!result.content) {
    return {
      ok: false,
      reason: "ROUTER_MODEL_ERROR",
      model: result.requestedModel,
    };
  }
  const parsed = parseAiRouterJson(result.content);
  if (!parsed) {
    return {
      ok: false,
      reason: "ROUTER_INVALID_RESPONSE",
      model: result.requestedModel,
    };
  }
  return { ok: true, classification: parsed, model: result.requestedModel };
}

function decisionFromRulesFallback(
  query: string,
  fallbackReason: WorkspaceRouterDecision["fallbackReason"],
  note: string,
): WorkspaceRouterDecision {
  const rules = routeWorkspaceQueryByRules(query);
  const soft =
    rules.decision.sources.length === 0
      ? softAuthoritativeFallbackSources(query)
      : [];
  const sources =
    rules.decision.sources.length > 0 ? rules.decision.sources : soft;
  const workspaceIntent = workspaceIntentFromAiClassification(query, {
    intent:
      sources.length === 0
        ? "unknown"
        : sources.includes("knowledge_base") && sources.length === 1
          ? "knowledge"
          : sources.includes("clients") && sources.length === 1
            ? "client_lookup"
            : "multi",
    sources,
    requires_authoritative_data: sources.length > 0,
  });
  return {
    ...rules.decision,
    sources,
    requiresAuthoritativeData: sources.length > 0,
    intentLabel:
      sources.length === 0
        ? "unknown"
        : sources.includes("knowledge_base") && sources.length === 1
          ? "knowledge"
          : rules.decision.intentLabel,
    workspaceIntent,
    method: "FALLBACK",
    routerModelRequested: getWorkspaceRouterModel() ?? null,
    fallbackUsed: true,
    fallbackReason,
    reason: `${note}:${rules.decision.reason}${soft.length ? ":soft_source" : ""}`,
    confidence: Math.min(rules.decision.confidence, 0.5),
  };
}

/**
 * Hybrid router: DIRECT/RULE high-confidence → skip AI;
 * otherwise AI classifier with validated JSON; safe fallback on failure.
 */
export async function resolveWorkspaceRouting(
  query: string,
): Promise<WorkspaceRouterDecision> {
  // Preserve passport / drive-primary as direct-quality rules
  if (isPassportNumberLookupQuery(query) || isEmigrantDrivePrimaryQuery(query)) {
    const rules = routeWorkspaceQueryByRules(query);
    return {
      ...rules.decision,
      method: rules.decision.method,
      routerModelRequested: null,
      fallbackUsed: false,
      fallbackReason: "NONE",
    };
  }

  const rules = routeWorkspaceQueryByRules(query);
  if (rules.highConfidence && rules.decision.confidence >= ROUTER_CONFIDENCE_HIGH) {
    return {
      ...rules.decision,
      routerModelRequested: null,
      fallbackUsed: false,
      fallbackReason: "NONE",
    };
  }

  const ai = await classifyWithRouterModel(query);
  if (!ai.ok) {
    return decisionFromRulesFallback(query, ai.reason, "router_ai_failed");
  }

  const { classification, model } = ai;

  if (classification.confidence < ROUTER_CONFIDENCE_LOW) {
    // Low confidence: prefer rule result if it had any sources; else soft single source; never load-all
    const fallback = routeWorkspaceQueryByRules(query);
    if (fallback.decision.sources.length > 0) {
      return {
        ...fallback.decision,
        method: "FALLBACK",
        routerModelRequested: model,
        fallbackUsed: true,
        fallbackReason: "ROUTER_LOW_CONFIDENCE",
        reason: `low_confidence:${classification.reason}`,
        confidence: classification.confidence,
      };
    }
    const soft = softAuthoritativeFallbackSources(query);
    if (soft.length > 0) {
      return {
        intentLabel: soft[0] === "knowledge_base" ? "knowledge" : "client_lookup",
        sources: soft,
        requiresAuthoritativeData: true,
        confidence: classification.confidence,
        reason: `low_confidence_soft:${classification.reason}`,
        method: "FALLBACK",
        workspaceIntent: workspaceIntentFromAiClassification(query, {
          intent: soft[0] === "knowledge_base" ? "knowledge" : "client_lookup",
          sources: soft,
          requires_authoritative_data: true,
        }),
        routerModelRequested: model,
        fallbackUsed: true,
        fallbackReason: "ROUTER_LOW_CONFIDENCE",
      };
    }
    return {
      intentLabel: "unknown",
      sources: [],
      requiresAuthoritativeData: classification.requires_authoritative_data,
      confidence: classification.confidence,
      reason: `low_confidence_no_sources:${classification.reason}`,
      method: "FALLBACK",
      workspaceIntent: workspaceIntentFromAiClassification(query, {
        intent: "unknown",
        sources: [],
        requires_authoritative_data: false,
      }),
      routerModelRequested: model,
      fallbackUsed: true,
      fallbackReason: "ROUTER_LOW_CONFIDENCE",
    };
  }

  const workspaceIntent = workspaceIntentFromAiClassification(query, classification);
  const method: RoutingMethod = "AI";
  return {
    intentLabel: classification.intent,
    sources: classification.sources,
    requiresAuthoritativeData: classification.requires_authoritative_data,
    confidence: classification.confidence,
    reason: classification.reason,
    method,
    workspaceIntent,
    routerModelRequested: model,
    fallbackUsed: false,
    fallbackReason: "NONE",
  };
}

/** Sync path for tests / callers that cannot await — rules only. */
export function resolveWorkspaceRoutingSync(query: string): WorkspaceRouterDecision {
  const rules = routeWorkspaceQueryByRules(query);
  return {
    ...rules.decision,
    routerModelRequested: null,
    fallbackUsed: false,
    fallbackReason: "NONE",
  };
}

export function intentToSources(intent: WorkspaceQueryIntent): WorkspaceRouteSource[] {
  const sources: WorkspaceRouteSource[] = [];
  if (intent.needsKb) sources.push("knowledge_base");
  if (intent.needsClients) sources.push("clients");
  if (intent.needsEmigrantDrive) sources.push("emigrant_drive");
  if (intent.needsEmigrantDesk) sources.push("emigrant_desk");
  if (intent.needsFormgrid) sources.push("formgrid");
  return sources;
}
