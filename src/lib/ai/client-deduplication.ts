import type { ClientContext, MergedClientContext } from "@/lib/ai/client-context";
import {
  extractPassportFromClientRecord,
  passportsMatch,
} from "@/lib/ai/client-passport";
import { buildNormalizedNameParts } from "@/lib/ai/russian-name-morphology";
import { normalizeComparable, normalizeText } from "@/lib/ai/search-normalize";
import { normalizePhone, tokensMatchWord } from "@/lib/ai/client-search";

export type DuplicateCheck = {
  /** Надёжный дубль — автоматический merge (паспорт, email, телефон, telegram). */
  isDuplicate: boolean;
  /** Возможный дубль — только ФИО, без автоматического merge. */
  isPossibleDuplicate: boolean;
  reasons: string[];
  possibleReasons: string[];
};

export type ClientDuplicateGroup = {
  parts: ClientContext[];
  mergeReasons: string[];
  merged: MergedClientContext;
};

export type PossibleDuplicatePair = {
  left: ClientContext;
  right: ClientContext;
  possibleReasons: string[];
};

function nameTokens(name: string): string[] {
  return normalizeText(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2);
}

function normalizeEmail(value: string): string {
  return normalizeText(value);
}

function extractTelegram(ctx: ClientContext): string {
  for (const [key, value] of Object.entries(ctx.debugRow)) {
    if (/telegram|телеграм/i.test(key) && value.trim()) {
      return normalizeComparable(value);
    }
  }
  return "";
}

function phonesMatch(a: string, b: string): boolean {
  const pa = normalizePhone(a);
  const pb = normalizePhone(b);
  if (pa.length < 7 || pb.length < 7) return false;
  return pa === pb || pa.endsWith(pb.slice(-10)) || pb.endsWith(pa.slice(-10));
}

function namesOverlapScore(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  let matched = 0;
  for (const token of tokensA) {
    if (tokensB.some((word) => tokensMatchWord(token, word))) matched++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return matched / union;
}

function surnameAndFirstNameMatch(nameA: string, nameB: string): boolean {
  const a = nameTokens(nameA);
  const b = nameTokens(nameB);
  if (a.length === 0 || b.length === 0) return false;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;

  if (shorter.length >= 2) {
    const key = shorter.slice(0, 2);
    if (key.every((token) => longer.some((word) => tokensMatchWord(token, word)))) {
      return true;
    }
  }

  if (shorter.length === 1) {
    return longer.some((word) => tokensMatchWord(shorter[0], word));
  }

  return false;
}

function fioWithoutPatronymicMatch(nameA: string, nameB: string): boolean {
  const a = nameTokens(nameA);
  const b = nameTokens(nameB);
  if (a.length < 2 || b.length < 2) return false;

  const coreA = a.slice(0, 2).sort().join(" ");
  const coreB = b.slice(0, 2).sort().join(" ");
  if (coreA === coreB) return true;

  const shorter = a.length <= b.length ? a.slice(0, 2) : b.slice(0, 2);
  const longer = a.length <= b.length ? b : a;
  return shorter.every((token) =>
    longer.some((word) => tokensMatchWord(token, word)),
  );
}

function collectFioReasons(left: ClientContext, right: ClientContext): string[] {
  const possibleReasons: string[] = [];

  if (fioWithoutPatronymicMatch(left.name, right.name)) {
    possibleReasons.push("фамилия + имя");
  } else if (surnameAndFirstNameMatch(left.name, right.name)) {
    possibleReasons.push("фамилия + имя (partial)");
  } else {
    const overlap = namesOverlapScore(nameTokens(left.name), nameTokens(right.name));
    if (overlap >= 0.75) {
      possibleReasons.push(
        `normalized_full_name overlap ${Math.round(overlap * 100)}%`,
      );
    }

    const leftNorm = buildNormalizedNameParts(nameTokens(left.name)).normalizedFullName;
    const rightNorm = buildNormalizedNameParts(nameTokens(right.name)).normalizedFullName;
    if (
      leftNorm &&
      rightNorm &&
      (leftNorm === rightNorm ||
        normalizeComparable(leftNorm) === normalizeComparable(rightNorm))
    ) {
      possibleReasons.push("normalized_full_name");
    }
  }

  return possibleReasons;
}

export function areClientsDuplicates(
  left: ClientContext,
  right: ClientContext,
): DuplicateCheck {
  const reasons: string[] = [];

  if (passportsMatch(left, right)) {
    reasons.push("passport");
  }

  if (
    left.email &&
    right.email &&
    normalizeEmail(left.email) === normalizeEmail(right.email)
  ) {
    reasons.push("email");
  }

  if (left.phone && right.phone && phonesMatch(left.phone, right.phone)) {
    reasons.push("phone");
  }

  const tgLeft = extractTelegram(left);
  const tgRight = extractTelegram(right);
  if (tgLeft && tgRight && tgLeft === tgRight) {
    reasons.push("telegram");
  }

  const possibleReasons = collectFioReasons(left, right);

  const passportsDiffer =
    isValidPassportPair(left, right) && !passportsMatch(left, right);

  const isDuplicate = reasons.length > 0;
  const isPossibleDuplicate =
    !isDuplicate &&
    !passportsDiffer &&
    possibleReasons.length > 0;

  return {
    isDuplicate,
    isPossibleDuplicate,
    reasons,
    possibleReasons,
  };
}

function isValidPassportPair(left: ClientContext, right: ClientContext): boolean {
  const leftNorm = extractPassportFromClientRecord(left).normalized;
  const rightNorm = extractPassportFromClientRecord(right).normalized;
  return Boolean(leftNorm && rightNorm);
}

export function findPossibleDuplicatePairs(
  clients: ClientContext[],
): PossibleDuplicatePair[] {
  const pairs: PossibleDuplicatePair[] = [];

  for (let i = 0; i < clients.length; i++) {
    for (let j = i + 1; j < clients.length; j++) {
      const check = areClientsDuplicates(clients[i], clients[j]);
      if (check.isPossibleDuplicate) {
        pairs.push({
          left: clients[i],
          right: clients[j],
          possibleReasons: check.possibleReasons,
        });
      }
    }
  }

  return pairs;
}

function pickLongestName(parts: ClientContext[]): string {
  return [...parts]
    .sort((a, b) => b.name.length - a.name.length)[0]?.name ?? parts[0].name;
}

function pickFirstNonEmpty(values: string[]): string {
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed && trimmed !== "—") return trimmed;
  }
  return "";
}

export function mergeClientContexts(parts: ClientContext[]): MergedClientContext {
  const sorted = [...parts].sort((a, b) => b.score - a.score);
  const crm = parts.find((part) => part.source === "clients");
  const formgrid = parts.find((part) => part.source === "new_clients");
  const primary = crm ?? sorted[0];

  const mergeReasons = new Set<string>();
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const check = areClientsDuplicates(parts[i], parts[j]);
      check.reasons.forEach((reason) => mergeReasons.add(reason));
    }
  }

  const statusCrm = crm?.status ?? "";
  const statusForm = formgrid?.status ?? "";
  const conflicts: MergedClientContext["conflicts"] = [];
  if (statusCrm && statusForm && statusCrm !== statusForm) {
    conflicts.push({
      field: "Статус",
      values: [
        { source: "CRM", value: statusCrm },
        { source: "Анкета", value: statusForm },
      ],
    });
  }

  return {
    source: "merged",
    sourceLabel: "Объединённый",
    rowIndex: primary.rowIndex,
    name: pickLongestName(parts),
    phone: pickFirstNonEmpty(parts.map((part) => part.phone)),
    email: pickFirstNonEmpty(parts.map((part) => part.email)),
    country: pickFirstNonEmpty(parts.map((part) => part.country)),
    direction: pickFirstNonEmpty(parts.map((part) => part.direction)),
    status: pickFirstNonEmpty([statusCrm, statusForm]),
    manager: pickFirstNonEmpty(parts.map((part) => part.manager)),
    lastActivity: pickFirstNonEmpty(parts.map((part) => part.lastActivity)),
    surveyData: parts
      .filter((part) => part.source === "new_clients")
      .map((part) => part.surveyData)
      .filter(Boolean)
      .join("\n\n"),
    crmData: crm?.surveyData ?? "",
    score: Math.max(...parts.map((part) => part.score)),
    matchedFields: [...new Set(parts.flatMap((part) => part.matchedFields))],
    mergeReasons: [...mergeReasons],
    parts,
    conflicts,
    debugRow: Object.fromEntries(
      parts.flatMap((part) =>
        Object.entries(part.debugRow).map(([key, value]) => [
          `${part.sourceLabel}:${key}`,
          value,
        ]),
      ),
    ),
  };
}

export function groupDuplicateClients(
  clients: ClientContext[],
): ClientDuplicateGroup[] {
  const groups: ClientContext[][] = [];

  for (const client of clients) {
    let placed = false;
    for (const group of groups) {
      if (group.some((member) => areClientsDuplicates(member, client).isDuplicate)) {
        group.push(client);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([client]);
  }

  return groups.map((parts) => {
    const mergeReasons = new Set<string>();
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        areClientsDuplicates(parts[i], parts[j]).reasons.forEach((reason) =>
          mergeReasons.add(reason),
        );
      }
    }
    return {
      parts,
      mergeReasons: [...mergeReasons],
      merged: mergeClientContexts(parts),
    };
  });
}

export function deduplicateToResolved(
  clients: ClientContext[],
): Array<ClientContext | MergedClientContext> {
  return groupDuplicateClients(clients).map((group) =>
    group.parts.length === 1 ? group.parts[0] : group.merged,
  );
}
