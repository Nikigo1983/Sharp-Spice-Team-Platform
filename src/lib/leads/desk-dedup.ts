import { normalizePassport } from "@/lib/ai/client-passport";
import { normalizeText } from "@/lib/ai/search-normalize";
import type { EmigrantDeskClient } from "@/lib/emigrant-desk/types";

export const DESK_STRONG_REASON_LABELS: Record<string, string> = {
  desk_case_number: "Desk case_number",
  desk_email: "Desk email",
};

export const DESK_MEDIUM_REASON_LABELS: Record<string, string> = {
  desk_name: "Desk ФИО",
};

export type DeskDedupCheck = {
  isStrongDuplicate: boolean;
  isMediumDuplicate: boolean;
  strongReasons: string[];
  mediumReasons: string[];
};

export function deskClientFullName(client: EmigrantDeskClient): string {
  return [client.lastName, client.firstName].filter(Boolean).join(" ").trim();
}

function normalizeEmail(value: string): string {
  return normalizeText(value).trim().toLowerCase();
}

function nameTokens(name: string): string[] {
  return normalizeText(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2);
}

export function deskFullNameMatches(leadName: string, desk: EmigrantDeskClient): boolean {
  const deskName = deskClientFullName(desk);
  const leadTokens = nameTokens(leadName);
  const deskTokens = nameTokens(deskName);
  if (leadTokens.length < 2 || deskTokens.length < 2) return false;

  const coreLead = leadTokens.slice(0, 2).sort().join(" ");
  const coreDesk = deskTokens.slice(0, 2).sort().join(" ");
  return coreLead === coreDesk;
}

export function checkLeadAgainstDesk(
  lead: { name: string; passport: string; email: string },
  desk: EmigrantDeskClient,
): DeskDedupCheck {
  const leadPassport = normalizePassport(lead.passport);
  const deskCase = normalizePassport(desk.caseNumber ?? "");
  const passportMatch =
    Boolean(leadPassport && deskCase) && leadPassport === deskCase;

  const leadEmail = normalizeEmail(lead.email);
  const deskEmail = normalizeEmail(desk.email);
  const emailMatch = Boolean(leadEmail && deskEmail) && leadEmail === deskEmail;

  const nameMatch = deskFullNameMatches(lead.name, desk);

  const strongReasons: string[] = [];
  if (passportMatch) strongReasons.push("desk_case_number");
  if (emailMatch) strongReasons.push("desk_email");

  const mediumReasons: string[] = [];
  if (!strongReasons.length && nameMatch) {
    mediumReasons.push("desk_name");
  }

  return {
    isStrongDuplicate: strongReasons.length > 0,
    isMediumDuplicate: mediumReasons.length > 0,
    strongReasons,
    mediumReasons,
  };
}

export function formatDeskStrongReasons(reasons: string[]): string[] {
  return reasons.map((r) => DESK_STRONG_REASON_LABELS[r] ?? r);
}

export function formatDeskMediumReasons(reasons: string[]): string[] {
  return reasons.map((r) => DESK_MEDIUM_REASON_LABELS[r] ?? r);
}
