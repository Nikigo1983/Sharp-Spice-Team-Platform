import "server-only";

import { createHash } from "node:crypto";
import type { ClientRefLifecycleCheckpoint } from "@/lib/ai/workspace-ai-browser-contract";

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
