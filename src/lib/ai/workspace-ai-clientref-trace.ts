import "server-only";

import { createHash } from "node:crypto";
import type { ClientRefLifecycleCheckpoint } from "@/lib/ai/workspace-ai-browser-contract";
import { isQuestionnaireUuid } from "@/lib/ai/client-ref";

/** Non-reversible ClientRef fingerprint for Preview diagnostics. */
export function clientRefFingerprint(
  clientId: string | null | undefined,
): string | null {
  const id = clientId?.trim();
  if (!id) return null;
  return createHash("sha256").update(id).digest("hex").slice(0, 16);
}

/**
 * Preview-only ClientRef lifecycle tracing.
 * Hard-disabled after diagnostic pass — keep off until explicitly re-enabled.
 */
export function isClientRefLifecycleTraceEnabled(): boolean {
  return false;
}

export function logClientRefLifecycleTrace(params: {
  checkpoint: ClientRefLifecycleCheckpoint;
  requestId: string;
  turn?: number | null;
  hasClientRef: boolean;
  clientId?: string | null;
  sseEvent?: string | null;
  uiTransition?: string | null;
}): void {
  if (!isClientRefLifecycleTraceEnabled()) return;
  console.info(
    JSON.stringify({
      type: "ai_clientref_lifecycle_trace",
      checkpoint: params.checkpoint,
      requestId: params.requestId,
      turn: params.turn ?? null,
      hasClientRef: params.hasClientRef,
      clientRefFp: clientRefFingerprint(params.clientId),
      sseEvent: params.sseEvent ?? null,
      uiTransition: params.uiTransition ?? null,
    }),
  );
}

/** Temporary Preview-only path diagnosis — never logs identifiers or PII. */
export function isClientRefPathDiagEnabled(): boolean {
  return process.env.VERCEL_ENV === "preview";
}

export type ClientRefIdType =
  | "questionnaire_uuid"
  | "non_uuid_string"
  | "empty"
  | "absent";

export function classifyClientRefIdType(
  value: string | null | undefined,
): ClientRefIdType {
  if (value == null) return "absent";
  const t = String(value).trim();
  if (!t) return "empty";
  if (isQuestionnaireUuid(t)) return "questionnaire_uuid";
  return "non_uuid_string";
}

export function logClientRefPathDiag(params: {
  requestId: string;
  pathName: string;
  resolverName?: string | null;
  uniqueResolution?: boolean | null;
  candidateIdField?: string | null;
  candidateIdType?: ClientRefIdType | null;
  commitUniqueCalled?: boolean | null;
  commitAccepted?: boolean | null;
  linkedClientIdState?: "PRESENT" | "ABSENT" | null;
  sseLinkedClientIdState?: "PRESENT" | "ABSENT" | null;
  note?: string | null;
}): void {
  if (!isClientRefPathDiagEnabled()) return;
  console.info(
    JSON.stringify({
      type: "ai_clientref_path_diag",
      requestId: params.requestId,
      pathName: params.pathName,
      resolverName: params.resolverName ?? null,
      uniqueResolution: params.uniqueResolution ?? null,
      candidateIdField: params.candidateIdField ?? null,
      candidateIdType: params.candidateIdType ?? null,
      commitUniqueCalled: params.commitUniqueCalled ?? null,
      commitAccepted: params.commitAccepted ?? null,
      linkedClientIdState: params.linkedClientIdState ?? null,
      sseLinkedClientIdState: params.sseLinkedClientIdState ?? null,
      note: params.note ?? null,
    }),
  );
}
