/**
 * Canonical AI ClientRef (Phase 1).
 * Identity = questionnaire UUID from client_portal_questionnaires.
 * Names are search input only — never canonical identity.
 */

export type ClientResolutionOutcome =
  | "RESOLVED"
  | "RESOLVED_LOCKED"
  | "AMBIGUOUS"
  | "NOT_FOUND"
  | "NOT_REQUIRED"
  | "UNAUTHORIZED";

export type ClientRef = {
  /** Canonical questionnaire UUID. */
  clientId: string;
  /** Safe UI / prompt label (display name). Not identity. */
  displayLabel?: string | null;
  resolutionOutcome: ClientResolutionOutcome;
  source: "client_portal";
};

export function isQuestionnaireUuid(value: string | null | undefined): boolean {
  const id = value?.trim() ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

export function createClientRef(params: {
  clientId: string;
  displayLabel?: string | null;
  resolutionOutcome?: ClientResolutionOutcome;
}): ClientRef | null {
  const clientId = params.clientId.trim();
  if (!isQuestionnaireUuid(clientId)) return null;
  return {
    clientId,
    displayLabel: params.displayLabel?.trim() || null,
    resolutionOutcome: params.resolutionOutcome ?? "RESOLVED",
    source: "client_portal",
  };
}

/** Privacy-safe metadata for traces/logs — never emit UUID or label. */
export function clientRefTraceFields(ref: ClientRef | null | undefined): {
  clientRefPresent: boolean;
  clientResolutionOutcome: ClientResolutionOutcome | "NONE";
} {
  if (!ref) {
    return { clientRefPresent: false, clientResolutionOutcome: "NONE" };
  }
  return {
    clientRefPresent: true,
    clientResolutionOutcome: ref.resolutionOutcome,
  };
}

export function clientRefsEqual(
  a: ClientRef | null | undefined,
  b: ClientRef | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a.clientId === b.clientId;
}
