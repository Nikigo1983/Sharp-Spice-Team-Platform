/**
 * Canonical AI ClientRef (Phase 1).
 * Identity = client_portal_questionnaires.id (invite UUID or stable portal
 * import PK). Names are search input only - never canonical identity.
 */

export type ClientResolutionOutcome =
  | "RESOLVED"
  | "RESOLVED_LOCKED"
  | "AMBIGUOUS"
  | "NOT_FOUND"
  | "NOT_REQUIRED"
  | "UNAUTHORIZED";

export type ClientRef = {
  /** Canonical questionnaire id (portal PK). */
  clientId: string;
  /** Safe UI / prompt label (display name). Not identity. */
  displayLabel?: string | null;
  resolutionOutcome: ClientResolutionOutcome;
  source: "client_portal";
};

/** RFC 4122 UUID (invite / native portal questionnaires). */
export function isQuestionnaireUuid(value: string | null | undefined): boolean {
  const id = value?.trim() ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

/**
 * Stable client_portal_questionnaires.id values that may be locked as ClientRef.
 * Includes invite UUIDs and Formgrid/legacy CRM import PKs (the actual row id
 * Finance uses as clientExternalId). Rejects sheet row ids, passports, names.
 */
export function isCanonicalQuestionnaireId(
  value: string | null | undefined,
): boolean {
  const id = value?.trim() ?? "";
  if (!id) return false;
  if (isQuestionnaireUuid(id)) return true;
  if (/^formgrid-q-[a-f0-9]+$/i.test(id)) return true;
  if (/^legacy-q-[a-f0-9]+$/i.test(id)) return true;
  return false;
}

export function createClientRef(params: {
  clientId: string;
  displayLabel?: string | null;
  resolutionOutcome?: ClientResolutionOutcome;
}): ClientRef | null {
  const clientId = params.clientId.trim();
  if (!isCanonicalQuestionnaireId(clientId)) return null;
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
