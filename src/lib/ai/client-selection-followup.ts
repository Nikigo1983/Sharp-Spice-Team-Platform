import type { ClientContext } from "@/lib/ai/client-context";
import { mergeClientContexts } from "@/lib/ai/client-deduplication";
import type { MergedClientContext } from "@/lib/ai/client-context";

type ChatTurn = { role: "user" | "assistant"; content: string };

export type ClientSelectionFollowUp =
  | { kind: "merge_all"; clients: ClientContext[] }
  | { kind: "select"; client: ClientContext; index: number }
  | { kind: "merge_selected"; merged: MergedClientContext; indices: number[] };

const MERGE_PHRASES = [
  /один\s+и\s+тот\s+же\s+клиент/i,
  /одного\s+клиента/i,
  /объедин/i,
  /это\s+тот\s+же/i,
  /тот\s+же\s+человек/i,
  /тот\s+же\s+клиент/i,
  /да,?\s*это\s+он/i,
  /это\s+он/i,
  /это\s+она/i,
  /один\s+человек/i,
];

const SELECT_NUMBER = /(?:выбери|выберите|номер|вариант|клиент[а]?)\s*(\d+)/i;
const ORDINAL: Record<string, number> = {
  первый: 0,
  первого: 0,
  первую: 0,
  первая: 0,
  второй: 1,
  второго: 1,
  вторую: 1,
  вторая: 1,
  третий: 2,
  третьего: 2,
  третью: 2,
  третья: 2,
};

function isSelectionFollowUpMessage(message: string): boolean {
  const trimmed = message.trim();
  if (MERGE_PHRASES.some((pattern) => pattern.test(trimmed))) return true;
  if (SELECT_NUMBER.test(trimmed)) return true;
  if (/^\d+$/.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  if (lower in ORDINAL) return true;
  return false;
}

function parseSelectionIndex(message: string, max: number): number | null {
  const trimmed = message.trim();
  const numOnly = trimmed.match(/^(\d+)$/);
  if (numOnly) {
    const idx = Number(numOnly[1]) - 1;
    return idx >= 0 && idx < max ? idx : null;
  }

  const labeled = trimmed.match(SELECT_NUMBER);
  if (labeled?.[1]) {
    const idx = Number(labeled[1]) - 1;
    return idx >= 0 && idx < max ? idx : null;
  }

  const lower = trimmed.toLowerCase();
  if (lower in ORDINAL) {
    const idx = ORDINAL[lower];
    return idx < max ? idx : null;
  }

  return null;
}

function lastAssistantListedCandidates(
  history: ChatTurn[],
): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role !== "assistant") continue;
    return /найдено несколько клиентов|уточните,\s*кого выбрать|точного совпадения не найдено|возможно,\s*вы имели в виду|похожие записи|выберите клиента/i.test(
      turn.content,
    );
  }
  return false;
}

export function resolveClientSelectionFollowUp(
  message: string,
  pendingCandidates: ClientContext[] | null | undefined,
  history: ChatTurn[] = [],
): ClientSelectionFollowUp | null {
  if (!pendingCandidates?.length) {
    if (!isSelectionFollowUpMessage(message)) return null;
    if (!lastAssistantListedCandidates(history)) return null;
    return null;
  }

  if (!isSelectionFollowUpMessage(message)) return null;

  const trimmed = message.trim();
  if (MERGE_PHRASES.some((pattern) => pattern.test(trimmed))) {
    return { kind: "merge_all", clients: pendingCandidates };
  }

  const index = parseSelectionIndex(trimmed, pendingCandidates.length);
  if (index !== null) {
    return {
      kind: "select",
      client: pendingCandidates[index],
      index,
    };
  }

  return null;
}

export function followUpToClientContext(
  followUp: ClientSelectionFollowUp,
): ClientContext | MergedClientContext {
  if (followUp.kind === "merge_all") {
    return mergeClientContexts(followUp.clients);
  }
  if (followUp.kind === "merge_selected") {
    return followUp.merged;
  }
  return followUp.client;
}
