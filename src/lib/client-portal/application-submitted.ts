/**
 * Staff marks a portal «Новый клиент» as processed («Заявка подана»).
 * Clears the yellow badge and removes the case from the portal-new filter.
 *
 * Staff can also place any intake case (incl. legacy CRM) into the
 * «Новые клиенты» queue until «Заявка подана».
 */

export const APPLICATION_SUBMITTED_KEY = "__applicationSubmitted";
export const STAFF_NEW_CLIENT_QUEUE_KEY = "__staffNewClientQueue";

export type ApplicationSubmittedState = {
  submitted: true;
  submittedAt: string;
  submittedByUserId: string;
  submittedByName: string;
};

export type StaffNewClientQueueState = {
  queued: true;
  queuedAt: string;
  queuedByUserId: string;
  queuedByName: string;
};

export function isApplicationSubmitted(
  answers: Record<string, unknown> | null | undefined,
): boolean {
  const raw = answers?.[APPLICATION_SUBMITTED_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return (raw as { submitted?: unknown }).submitted === true;
}

export function isStaffNewClientQueue(
  answers: Record<string, unknown> | null | undefined,
): boolean {
  const raw = answers?.[STAFF_NEW_CLIENT_QUEUE_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return (raw as { queued?: unknown }).queued === true;
}

export function writeApplicationSubmitted(
  answers: Record<string, unknown>,
  meta: {
    submittedAt: string;
    submittedByUserId: string;
    submittedByName: string;
  },
): Record<string, unknown> {
  const state: ApplicationSubmittedState = {
    submitted: true,
    submittedAt: meta.submittedAt,
    submittedByUserId: meta.submittedByUserId,
    submittedByName: meta.submittedByName,
  };
  const next: Record<string, unknown> = {
    ...answers,
    [APPLICATION_SUBMITTED_KEY]: state,
  };
  delete next[STAFF_NEW_CLIENT_QUEUE_KEY];
  return next;
}

export function writeStaffNewClientQueue(
  answers: Record<string, unknown>,
  meta: {
    queuedAt: string;
    queuedByUserId: string;
    queuedByName: string;
  },
): Record<string, unknown> {
  const state: StaffNewClientQueueState = {
    queued: true,
    queuedAt: meta.queuedAt,
    queuedByUserId: meta.queuedByUserId,
    queuedByName: meta.queuedByName,
  };
  const next: Record<string, unknown> = {
    ...answers,
    [STAFF_NEW_CLIENT_QUEUE_KEY]: state,
  };
  // Re-opening the new-client queue clears a prior «Заявка подана» stamp.
  delete next[APPLICATION_SUBMITTED_KEY];
  return next;
}
