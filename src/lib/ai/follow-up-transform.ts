/**
 * Follow-up transform helpers (Phase 1).
 * Pure rewrite of prior draft — no resolve_client / Finance refetch.
 */

import { isFollowUpTransformQuery } from "@/lib/ai/current-task";
import {
  isClientBoundDraftTransformAllowed,
  type WorkspaceCaseMemory,
} from "@/lib/ai/workspace-case-memory";

type ChatTurn = { role: "user" | "assistant"; content: string };

export type FollowUpTransformPlan = {
  taskClass: "FOLLOW_UP_TRANSFORM";
  priorDraft: string;
  instruction: string;
  resolveClient: false;
  refetchFinance: false;
  attachEvidencePack: false;
};

export function findPriorAssistantDraft(
  history: ChatTurn[],
): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn?.role === "assistant" && turn.content?.trim()) {
      return turn.content.trim();
    }
  }
  return null;
}

export function planFollowUpTransform(params: {
  query: string;
  history: ChatTurn[];
  /** When set, client-bound draft must match current lock after switch. */
  caseMemory?: WorkspaceCaseMemory | null;
}): FollowUpTransformPlan | null {
  if (!isFollowUpTransformQuery(params.query)) return null;
  if (!isClientBoundDraftTransformAllowed(params.caseMemory)) return null;
  const priorDraft = findPriorAssistantDraft(params.history);
  if (!priorDraft) return null;
  return {
    taskClass: "FOLLOW_UP_TRANSFORM",
    priorDraft,
    instruction: params.query.trim(),
    resolveClient: false,
    refetchFinance: false,
    attachEvidencePack: false,
  };
}

export function formatFollowUpTransformContext(plan: FollowUpTransformPlan): string {
  return [
    "=== FOLLOW_UP_TRANSFORM ===",
    "Перепиши предыдущий черновик по инструкции менеджера.",
    "Не запрашивай и не выдумывай новые факты о клиенте.",
    "Не меняй суммы/даты/имена, если инструкция этого не требует.",
    "",
    "Инструкция:",
    plan.instruction,
    "",
    "Черновик:",
    plan.priorDraft.slice(0, 6000),
  ].join("\n");
}
