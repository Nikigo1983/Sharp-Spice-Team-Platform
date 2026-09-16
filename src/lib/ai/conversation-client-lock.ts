/**
 * Conversation ClientRef lock helpers (Phase 1).
 * Durable state: ClientRef via caseMemory.linkedClientId + display label.
 * Do not persist EvidencePack / passport / finance dumps.
 */

import {
  createClientRef,
  type ClientRef,
} from "@/lib/ai/client-ref";
import type { WorkspaceCaseMemory } from "@/lib/ai/workspace-case-memory";
import {
  CLIENT_BOUND_DRAFT_CLEARED,
  emptyCaseMemory,
  sanitizeCaseMemory,
} from "@/lib/ai/workspace-case-memory";

export function clientRefFromCaseMemory(
  memory: WorkspaceCaseMemory | null | undefined,
): ClientRef | null {
  const sanitized = sanitizeCaseMemory(memory);
  if (!sanitized?.linkedClientId) return null;
  return createClientRef({
    clientId: sanitized.linkedClientId,
    displayLabel: sanitized.clientName,
    resolutionOutcome: "RESOLVED_LOCKED",
  });
}

export function lockClientRefIntoCaseMemory(
  memory: WorkspaceCaseMemory | null | undefined,
  ref: ClientRef,
): WorkspaceCaseMemory {
  const base = sanitizeCaseMemory(memory) ?? emptyCaseMemory();
  return {
    ...base,
    linkedClientId: ref.clientId,
    clientName: ref.displayLabel?.trim() || base.clientName,
    // Never carry passport in durable lock state.
    passport: null,
    updatedAt: new Date().toISOString(),
  };
}

export function clearClientRefFromCaseMemory(
  memory: WorkspaceCaseMemory | null | undefined,
): WorkspaceCaseMemory | null {
  const base = sanitizeCaseMemory(memory);
  if (!base) return null;
  return {
    ...base,
    linkedClientId: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Mark the active client-bound draft as belonging to this ClientRef
 * (e.g. after a debt-reminder letter). Enables safe follow-up transforms.
 */
export function bindClientBoundDraftToCaseMemory(
  memory: WorkspaceCaseMemory | null | undefined,
  clientId: string,
): WorkspaceCaseMemory {
  const base = sanitizeCaseMemory(memory) ?? emptyCaseMemory();
  return {
    ...base,
    draftClientId: clientId,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Atomic explicit client switch: replace lock and drop previous-client facts.
 * Safe cross-client leftovers are not retained as current-client evidence.
 */
export function applyClientSwitch(params: {
  memory: WorkspaceCaseMemory | null | undefined;
  previous?: ClientRef | null;
  next: ClientRef;
}): {
  memory: WorkspaceCaseMemory;
  clientRef: ClientRef;
  switched: boolean;
} {
  const previous =
    params.previous ?? clientRefFromCaseMemory(params.memory);
  const next: ClientRef = {
    ...params.next,
    resolutionOutcome: "RESOLVED_LOCKED",
  };
  if (previous && previous.clientId === next.clientId) {
    return {
      memory: lockClientRefIntoCaseMemory(params.memory, next),
      clientRef: next,
      switched: false,
    };
  }

  const transition = applyClientRefLockTransition({
    previous,
    next,
    switchExplicit: true,
  });
  if (!transition.switched && previous) {
    // Should not happen when ids differ and switchExplicit — keep previous.
    return {
      memory: lockClientRefIntoCaseMemory(params.memory, previous),
      clientRef: previous,
      switched: false,
    };
  }

  // Fresh authoritative identity boundary — no ALPHA finance/contact/profile facts.
  const memory: WorkspaceCaseMemory = {
    ...emptyCaseMemory(),
    linkedClientId: next.clientId,
    clientName: next.displayLabel?.trim() || null,
    passport: null,
    draftClientId: CLIENT_BOUND_DRAFT_CLEARED,
    updatedAt: new Date().toISOString(),
  };
  return { memory, clientRef: next, switched: Boolean(previous) };
}

/**
 * Switch lock only on explicit resolve to another ClientRef.
 */
export function applyClientRefLockTransition(params: {
  previous: ClientRef | null;
  next: ClientRef | null;
  switchExplicit: boolean;
}): { active: ClientRef | null; switched: boolean; stalePrevented: boolean } {
  const { previous, next, switchExplicit } = params;
  if (!next) {
    return { active: previous, switched: false, stalePrevented: false };
  }
  if (!previous) {
    return { active: next, switched: false, stalePrevented: false };
  }
  if (previous.clientId === next.clientId) {
    return {
      active: { ...next, resolutionOutcome: "RESOLVED_LOCKED" },
      switched: false,
      stalePrevented: false,
    };
  }
  if (!switchExplicit) {
    // Refuse silent cross-client bleed.
    return {
      active: previous,
      switched: false,
      stalePrevented: true,
    };
  }
  return { active: next, switched: true, stalePrevented: false };
}

/**
 * For non-client tasks, keep the ClientRef lock in durable conversation state
 * but do not inject case-memory client facts into the model prompt.
 */
export function caseMemoryForModelIngress(params: {
  caseMemory: WorkspaceCaseMemory | null | undefined;
  taskRequiresClientRef: boolean;
  needsClients: boolean;
  fastClientLookup: boolean;
}): WorkspaceCaseMemory | null {
  if (
    params.taskRequiresClientRef ||
    params.needsClients ||
    params.fastClientLookup
  ) {
    return sanitizeCaseMemory(params.caseMemory);
  }
  return null;
}
