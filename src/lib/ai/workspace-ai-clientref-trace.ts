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
 * Requires non-production deploy context AND explicit AI_CLIENTREF_LIFECYCLE_TRACE=1.
 * VERCEL_ENV=production can never enable (even if the flag is set).
 */
export function isClientRefLifecycleTraceEnabled(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  const nonProdDeploy =
    process.env.VERCEL_ENV === "preview" ||
    process.env.VERCEL_ENV === "development" ||
    (!process.env.VERCEL_ENV && process.env.NODE_ENV !== "production");
  return nonProdDeploy && process.env.AI_CLIENTREF_LIFECYCLE_TRACE === "1";
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
      clientRefPresence: params.hasClientRef ? "PRESENT" : "ABSENT",
      clientRefFp: clientRefFingerprint(params.clientId),
      sseEvent: params.sseEvent ?? null,
      uiTransition: params.uiTransition ?? null,
    }),
  );
}
