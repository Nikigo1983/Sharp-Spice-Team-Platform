import type { ClientContext } from "@/lib/ai/client-context";
import { areClientsDuplicates } from "@/lib/ai/client-deduplication";
import {
  checkLeadAgainstDesk,
  deskClientFullName,
  formatDeskMediumReasons,
  formatDeskStrongReasons,
} from "@/lib/leads/desk-dedup";
import type { EmigrantDeskClient } from "@/lib/emigrant-desk/types";
import type { LeadDedupAnalysis, LeadDuplicateMatch } from "@/lib/leads/lead-review-types";

const STRONG_REASON_LABELS: Record<string, string> = {
  passport: "паспорт",
  email: "email",
  phone: "телефон",
  telegram: "Telegram",
};

function formatReasons(reasons: string[]): string[] {
  return reasons.map((reason) => STRONG_REASON_LABELS[reason] ?? reason);
}

function pushMatch(
  target: LeadDuplicateMatch[],
  match: LeadDuplicateMatch,
): void {
  const exists = target.some(
    (entry) =>
      entry.source === match.source &&
      entry.sheetRow === match.sheetRow &&
      entry.clientId === match.clientId,
  );
  if (!exists) {
    target.push(match);
  }
}

export type LeadDedupInput = {
  name: string;
  passport: string;
  email: string;
};

export function analyzeLeadDuplicates(
  lead: ClientContext,
  crmContexts: ClientContext[],
  formgridContexts: ClientContext[],
  deskClients: EmigrantDeskClient[] = [],
  leadFields?: LeadDedupInput,
): LeadDedupAnalysis {
  const strongMatches: LeadDuplicateMatch[] = [];
  const mediumMatches: LeadDuplicateMatch[] = [];
  const possibleMatches: LeadDuplicateMatch[] = [];

  for (const crm of crmContexts) {
    const check = areClientsDuplicates(lead, crm);
    if (check.isDuplicate) {
      pushMatch(strongMatches, {
        matchType: "strong",
        source: "crm",
        name: crm.name,
        sheetRow: crm.rowIndex,
        clientId: crm.debugRow.id,
        reasons: formatReasons(check.reasons),
      });
    } else if (check.isPossibleDuplicate) {
      pushMatch(possibleMatches, {
        matchType: "possible",
        source: "crm",
        name: crm.name,
        sheetRow: crm.rowIndex,
        clientId: crm.debugRow.id,
        reasons: [],
        possibleReasons: check.possibleReasons,
      });
    }
  }

  for (const other of formgridContexts) {
    if (other.rowIndex === lead.rowIndex) continue;

    const check = areClientsDuplicates(lead, other);
    if (check.isDuplicate) {
      pushMatch(strongMatches, {
        matchType: "strong",
        source: "formgrid",
        name: other.name,
        sheetRow: other.rowIndex,
        reasons: formatReasons(check.reasons),
      });
    } else if (check.isPossibleDuplicate) {
      pushMatch(possibleMatches, {
        matchType: "possible",
        source: "formgrid",
        name: other.name,
        sheetRow: other.rowIndex,
        reasons: [],
        possibleReasons: check.possibleReasons,
      });
    }
  }

  const dedupFields: LeadDedupInput = leadFields ?? {
    name: lead.name,
    passport: lead.debugRow.passport ?? "",
    email: lead.email,
  };

  for (const desk of deskClients) {
    const check = checkLeadAgainstDesk(dedupFields, desk);
    const deskName = deskClientFullName(desk) || desk.email;

    if (check.isStrongDuplicate) {
      pushMatch(strongMatches, {
        matchType: "strong",
        source: "desk",
        name: deskName,
        clientId: desk.id,
        reasons: formatDeskStrongReasons(check.strongReasons),
      });
    } else if (check.isMediumDuplicate) {
      pushMatch(mediumMatches, {
        matchType: "medium",
        source: "desk",
        name: deskName,
        clientId: desk.id,
        reasons: formatDeskMediumReasons(check.mediumReasons),
      });
    }
  }

  return {
    strongMatches,
    mediumMatches,
    possibleMatches,
    hasStrongMatch: strongMatches.length > 0,
    hasMediumMatch: mediumMatches.length > 0,
    hasPossibleMatch: possibleMatches.length > 0,
  };
}
