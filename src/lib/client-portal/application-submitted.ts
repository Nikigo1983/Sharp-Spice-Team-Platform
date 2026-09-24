/**
 * Staff marks a portal «Новый клиент» as processed («Заявка подана»).
 * Clears the yellow badge and removes the case from the portal-new filter.
 */

export const APPLICATION_SUBMITTED_KEY = "__applicationSubmitted";

export type ApplicationSubmittedState = {
  submitted: true;
  submittedAt: string;
  submittedByUserId: string;
  submittedByName: string;
};

export function isApplicationSubmitted(
  answers: Record<string, unknown> | null | undefined,
): boolean {
  const raw = answers?.[APPLICATION_SUBMITTED_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return (raw as { submitted?: unknown }).submitted === true;
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
  return {
    ...answers,
    [APPLICATION_SUBMITTED_KEY]: state,
  };
}
