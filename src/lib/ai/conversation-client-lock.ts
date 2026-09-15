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
