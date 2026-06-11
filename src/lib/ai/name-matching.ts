import { extractSearchTokens } from "@/lib/ai/client-search";

const STOP_WORDS = new Set([
  "из",
  "наш",
  "нашего",
  "нашей",
  "наше",
  "нашим",
  "приложения",
  "приложение",
  "пложения",
  "emigrant",
  "desk",
  "croatia",
  "проверь",
  "проверить",
  "покажи",
  "найди",
  "какой",
  "какая",
  "какие",
  "какое",
  "номер",
  "номера",
  "номеру",
  "текущий",
  "текущая",
  "текущее",
  "статус",
  "статуса",
  "статусе",
  "клиент",
  "клиента",
  "клиентка",
  "клиентки",
  "клиенту",
  "клиентов",
  "дело",
  "дела",
  "кабинет",
  "кабинете",
  "таблица",
  "таблице",
  "есть",
  "нет",
  "где",
  "что",
  "кто",
  "кого",
  "кому",
  "для",
  "про",
  "при",
  "или",
  "это",
  "этот",
  "эта",
  "эти",
]);

/** Имя/фамилия из естественных фраз («клиентка Калашниковой», «по Ирине …»). */
export function extractPersonNameTokens(query: string): string[] {
  return extractSearchTokens(query);
}

export function tokenizeSearchQuery(query: string): string[] {
  return extractSearchTokens(query);
}

function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i++;
  }
  return i;
}

function wordVariants(word: string): string[] {
  const variants = new Set([word]);
  if (word.length > 4) variants.add(word.slice(0, -1));
  if (word.length > 5) variants.add(word.slice(0, -2));
  return [...variants];
}

/** Учитывает падежи, но не путает похожие фамилии (Белоногова ≠ Белоусова). */
export function namePartMatches(token: string, part: string): boolean {
  const t = token.toLowerCase().trim();
  const p = part.toLowerCase().trim();
  if (!t || !p) return false;
  if (t === p) return true;

  const shorter = t.length <= p.length ? t : p;
  const longer = t.length <= p.length ? p : t;
  if (shorter.length >= 5 && longer.includes(shorter)) return true;

  for (const tv of wordVariants(t)) {
    for (const pv of wordVariants(p)) {
      if (tv === pv) return true;
      const prefix = commonPrefixLength(tv, pv);
      const minLen = Math.min(tv.length, pv.length);
      const required = Math.max(5, minLen - 2);
      if (prefix >= required) return true;
    }
  }

  return false;
}

/** Ищет совпадения по словам в произвольной строке (ФИО, латиница, заметки). */
export function scoreNameInText(text: string, tokens: string[]): number {
  if (!text.trim() || tokens.length === 0) return 0;

  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3);

  const matched = tokens.filter((token) =>
    words.some((word) => namePartMatches(token, word)),
  );

  return matched.length * 12;
}

export function scorePersonName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  tokens: string[],
): number {
  const parts = [firstName, lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => part.trim());

  if (parts.length === 0 || tokens.length === 0) return 0;

  return scoreNameInText(parts.join(" "), tokens);
}
