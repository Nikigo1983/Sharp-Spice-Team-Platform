import type { ClientContext } from "@/lib/ai/client-context";
import { areClientsDuplicates } from "@/lib/ai/client-deduplication";
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

export function analyzeLeadDuplicates(
  lead: ClientContext,
  crmContexts: ClientContext[],
  formgridContexts: ClientContext[],
): LeadDedupAnalysis {
  const strongMatches: LeadDuplicateMatch[] = [];
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

  return {
    strongMatches,
    possibleMatches,
    hasStrongMatch: strongMatches.length > 0,
    hasPossibleMatch: possibleMatches.length > 0,
  };
}
