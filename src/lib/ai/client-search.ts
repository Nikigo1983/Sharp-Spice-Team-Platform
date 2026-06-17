/** Нормализация, fuzzy matching и scoring для Client Lookup. */

import { extractClientEntityFromQuery } from "@/lib/ai/client-entity-extract";
import {
  buildNormalizedNameParts,
  formatNormalizedQueryLabel,
  getRussianNameLemmaVariants,
  morphNameMatch,
  type NormalizedNameParts,
} from "@/lib/ai/russian-name-morphology";
import {
  normalizeComparable,
  normalizeText,
  transliterate,
} from "@/lib/ai/search-normalize";

export {
  normalizeComparable,
  normalizeText,
  transliterate,
} from "@/lib/ai/search-normalize";
export type { NormalizedNameParts } from "@/lib/ai/russian-name-morphology";
export { formatNormalizedQueryLabel } from "@/lib/ai/russian-name-morphology";

export type SearchFieldCategory =
  | "name"
  | "phone"
  | "email"
  | "notes"
  | "other";

export type SearchField = {
  label: string;
  value: string;
  category: SearchFieldCategory;
};

export type ClientSearchQuery = {
  raw: string;
  tokens: string[];
  email: string | null;
  phone: string | null;
  fullNamePhrase: string;
  morphology: NormalizedNameParts;
};

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

export type ClientSearchScore = {
  score: number;
  matchedFields: string[];
};

export const SEARCH_COLUMNS_CLIENTS = [
  "ФИО / фамилия",
  "normalized_full_name / normalized_surname / normalized_first_name",
  "латиница",
  "партнер от кого клиент",
  "договор",
  "телефон",
  "email",
  "паспорт",
  "менеджер",
  "референт",
  "заметки",
  "адрес букинга",
  "статус",
  "направление",
  "морфология (леммы + транслит)",
];

export const SEARCH_COLUMNS_NEW_CLIENTS = [
  "ФИО (кириллица)",
  "ФИО (латиница)",
  "normalized_full_name / normalized_surname / normalized_first_name",
  "телефон",
  "email",
  "telegram",
  "паспорт",
  "все поля анкеты",
  "морфология (леммы + транслит)",
];

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

export function fuzzySimilarity(a: string, b: string): number {
  const left = normalizeComparable(a);
  const right = normalizeComparable(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    const shorter = Math.min(left.length, right.length);
    const longer = Math.max(left.length, right.length);
    return shorter / longer;
  }

  const maxLen = Math.max(left.length, right.length);
  return 1 - levenshtein(left, right) / maxLen;
}

export function tokensMatchWord(token: string, word: string): boolean {
  if (!token || !word) return false;

  if (morphNameMatch(token, word)) return true;

  const t = normalizeText(token);
  const w = normalizeText(word);
  if (t === w) return true;

  const tc = normalizeComparable(token);
  const wc = normalizeComparable(word);
  if (tc.length >= 3 && wc.length >= 3) {
    if (tc === wc) return true;
    if (tc.length >= 4 && wc.length >= 4) {
      if (
        tc.startsWith(wc.slice(0, Math.min(5, wc.length))) ||
        wc.startsWith(tc.slice(0, Math.min(5, tc.length)))
      ) {
        return true;
      }
    }
  }

  const minLen = Math.min(t.length, w.length);
  if (minLen >= 4) {
    const sim = fuzzySimilarity(t, w);
    if (sim >= 0.72) return true;
  }

  return false;
}

export function extractEmailFromQuery(query: string): string | null {
  const match = query.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/iu);
  return match?.[0]?.toLowerCase() ?? null;
}

export function extractPhoneFromQuery(query: string): string | null {
  const digits = query.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits;
}

const QUERY_STOP_WORDS = new Set([
  "из",
  "наш",
  "нашего",
  "приложения",
  "приложение",
  "emigrant",
  "desk",
  "проверь",
  "покажи",
  "найди",
  "расскажи",
  "сделай",
  "какой",
  "какая",
  "какие",
  "номер",
  "текущий",
  "статус",
  "клиент",
  "клиента",
  "клиентку",
  "клиентов",
  "клиентом",
  "анкет",
  "анкета",
  "заявк",
  "заявка",
  "данные",
  "данных",
  "информация",
  "информацию",
  "информации",
  "известно",
  "про",
  "по",
  "мне",
  "дай",
  "что",
  "где",
  "есть",
  "о",
  "об",
  "у",
  "нас",
  "нам",
  "ли",
  "клиентке",
  "клиенткой",
  "клиентом",
  "клиентка",
  "клиентки",
  "профиль",
  "профиля",
  "происходит",
  "нее",
  "него",
  "неё",
  "нём",
  "всю",
  "все",
  "всё",
  "его",
  "её",
  "ему",
  "ей",
  "них",
  "этот",
  "этой",
  "этом",
  "этого",
]);

/** Служебные слова — после них имя не продолжается. */
const SERVICE_VERBS = new Set([
  "найди",
  "найти",
  "покажи",
  "расскажи",
  "дай",
  "сделай",
  "про",
  "информацию",
  "информация",
  "информации",
  "всю",
  "все",
  "всё",
  "что",
  "известно",
  "скажи",
  "напиши",
  "проверь",
  "узнай",
  "подскажи",
]);

function isNameLikeToken(token: string): boolean {
  return token.length >= 2 && /^[\p{L}][\p{L}\p{N}'-]*$/u.test(token);
}

/** Имя в начале запроса до первого служебного слова. */
export function extractLeadingCandidateName(query: string): string[] {
  const trimmed = query.trim();

  const capitalized = trimmed.match(
    /^([\p{Lu}][\p{L}'-]*(?:\s+[\p{Lu}][\p{L}'-]*){0,2})/u,
  );
  if (capitalized?.[1]) {
    const tokens: string[] = [];
    for (const word of capitalized[1].split(/\s+/)) {
      const normalized = normalizeText(word);
      if (SERVICE_VERBS.has(normalized) || QUERY_STOP_WORDS.has(normalized)) {
        break;
      }
      if (isNameLikeToken(normalized)) tokens.push(normalized);
    }
    if (tokens.length > 0) return tokens;
  }

  const lower = normalizeText(trimmed);
  const parts = lower.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const tokens: string[] = [];
  for (const part of parts) {
    if (SERVICE_VERBS.has(part) || QUERY_STOP_WORDS.has(part)) break;
    if (isNameLikeToken(part)) tokens.push(part);
    if (tokens.length >= 3) break;
  }
  return tokens;
}

export function extractSearchTokens(query: string): string[] {
  const entity = extractClientEntityFromQuery(query);
  if (entity) return entity.tokens;

  const leading = extractLeadingCandidateName(query);
  if (leading.length > 0) return leading;

  const lower = normalizeText(query);
  const patterns = [
    /(?:статус|дело|паспорт[ае]?|email|почт[ае]?|телефон|номер)\s+(?:у\s+)?([a-zа-яё][a-zа-яё\-]*(?:\s+[a-zа-яё][a-zа-яё\-]*){0,2})/iu,
    /(?:найди|покажи|дай).*(?:паспорт[ае]?|email|почт[аe]?|телефон)\s+([a-zа-яё][a-zа-яё\-]*(?:\s+[a-zа-яё][a-zа-яё\-]*){0,2})/iu,
    /([a-zа-яё][a-zа-яё\-]+\s+[a-zа-яё][a-zа-яё\-]+)\s*$/iu,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (!match?.[1]) continue;
    const tokens = match[1]
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => normalizeText(token))
      .filter((token) => token.length >= 3 && !QUERY_STOP_WORDS.has(token));
    if (tokens.length > 0) return tokens;
  }

  return lower
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => normalizeText(token))
    .filter((token) => token.length >= 3 && !QUERY_STOP_WORDS.has(token))
    .slice(0, 4);
}

export function buildClientSearchQuery(raw: string): ClientSearchQuery {
  const entity = extractClientEntityFromQuery(raw);
  const tokens = entity?.tokens ?? extractSearchTokens(raw);
  const email = extractEmailFromQuery(raw);
  const phone = extractPhoneFromQuery(raw);
  const morphology = entity?.morphology ?? buildNormalizedNameParts(tokens);
  return {
    raw: raw.trim(),
    tokens,
    email,
    phone,
    fullNamePhrase:
      entity?.searchPhrase ??
      (morphology.normalizedFullName || tokens.join(" ")),
    morphology,
  };
}

/** Нормализованные поля имени для строки таблицы. */
export function buildNormalizedNameFields(fullName: string): SearchField[] {
  const tokens = normalizeText(fullName)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2);
  if (tokens.length === 0) return [];

  const parts = buildNormalizedNameParts(tokens);
  const fields: SearchField[] = [
    {
      label: "normalized_full_name",
      value: parts.normalizedFullName,
      category: "name",
    },
  ];

  if (parts.normalizedSurname) {
    fields.push({
      label: "normalized_surname",
      value: parts.normalizedSurname,
      category: "name",
    });
  }
  if (parts.normalizedFirstName) {
    fields.push({
      label: "normalized_first_name",
      value: parts.normalizedFirstName,
      category: "name",
    });
  }

  for (const key of parts.matchKeys) {
    if (/^[a-z0-9]+$/i.test(key) && key.length >= 4) {
      fields.push({
        label: "normalized_translit",
        value: key,
        category: "name",
      });
    }
  }

  return fields;
}

function splitNameWords(fields: SearchField[]): string[] {
  const words: string[] = [];
  for (const field of fields) {
    if (field.category !== "name") continue;
    for (const word of normalizeText(field.value).split(/[^\p{L}\p{N}]+/u)) {
      if (word.length >= 2) words.push(word);
    }
    for (const variant of getRussianNameLemmaVariants(field.value)) {
      if (variant.length >= 2 && /[а-яё]/i.test(variant)) {
        words.push(variant);
      }
    }
  }
  return [...new Set(words)];
}

function morphologyTokensMatch(
  query: ClientSearchQuery,
  recordWords: string[],
): boolean {
  return query.morphology.lemmaTokens.every((lemma) => {
    const variants = getRussianNameLemmaVariants(lemma);
    return variants.some((variant) =>
      recordWords.some((word) => tokensMatchWord(variant, word)),
    );
  });
}

function allNameTokensMatchInAnyOrder(
  tokens: string[],
  nameWords: string[],
): boolean {
  if (tokens.length === 0) return false;
  return tokens.every((token) =>
    nameWords.some((word) => tokensMatchWord(token, word)),
  );
}

function sortedTokenKey(tokens: string[]): string {
  return [...tokens].map(normalizeText).sort().join(" ");
}

function recordNameTokenSet(nameValue: string): string[] {
  return normalizeText(nameValue)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2);
}

export function scoreClientRecord(
  query: ClientSearchQuery,
  fields: SearchField[],
): ClientSearchScore {
  const matchedFields: string[] = [];
  let score = 0;

  const nameFields = fields.filter((f) => f.category === "name");
  const noteFields = fields.filter((f) => f.category === "notes");
  const nameWords = splitNameWords(nameFields);
  const fullNameValues = nameFields
    .filter((f) => !f.label.startsWith("normalized_"))
    .map((f) => normalizeText(f.value))
    .filter(Boolean);

  if (query.phone) {
    for (const field of fields.filter((f) => f.category === "phone")) {
      const fieldPhone = normalizePhone(field.value);
      if (fieldPhone && (fieldPhone === query.phone || fieldPhone.endsWith(query.phone.slice(-10)))) {
        matchedFields.push(`${field.label}: exact phone`);
        return { score: 100, matchedFields };
      }
    }
    for (const field of fields) {
      const digits = normalizePhone(field.value);
      if (digits.length >= 7 && digits.includes(query.phone)) {
        matchedFields.push(`${field.label}: phone partial`);
        score = Math.max(score, 95);
      }
    }
  }

  if (query.email) {
    for (const field of fields.filter((f) => f.category === "email")) {
      const fieldEmail = normalizeText(field.value);
      if (fieldEmail === query.email || fieldEmail.includes(query.email)) {
        matchedFields.push(`${field.label}: exact email`);
        return { score: 100, matchedFields };
      }
    }
  }

  const queryFull = normalizeText(query.fullNamePhrase);
  const queryTokenKey = sortedTokenKey(query.morphology.lemmaTokens);

  if (queryFull.length >= 3) {
    for (const nameValue of fullNameValues) {
      const recordTokens = recordNameTokenSet(nameValue);
      const recordParts = buildNormalizedNameParts(recordTokens);
      const recordKey = sortedTokenKey(recordParts.lemmaTokens);

      if (
        nameValue === queryFull ||
        normalizeComparable(nameValue) === normalizeComparable(queryFull) ||
        recordParts.normalizedFullName === queryFull ||
        morphNameMatch(queryFull, nameValue) ||
        (queryTokenKey.length > 0 &&
          recordKey.length > 0 &&
          queryTokenKey === recordKey)
      ) {
        matchedFields.push("ФИО: exact full name match");
        score = Math.max(score, 95);
      } else if (
        query.morphology.lemmaTokens.length > 0 &&
        allNameTokensMatchInAnyOrder(query.morphology.lemmaTokens, recordTokens)
      ) {
        matchedFields.push("ФИО: all tokens in full name (any order)");
        score = Math.max(score, 90);
      }
    }
  }

  if (
    query.morphology.lemmaTokens.length > 0 &&
    morphologyTokensMatch(query, nameWords)
  ) {
    matchedFields.push("ФИО: all lemmas match (any order)");
    score = Math.max(score, 85);
  }

  if (
    query.tokens.length > 0 &&
    allNameTokensMatchInAnyOrder(query.tokens, nameWords)
  ) {
    matchedFields.push("ФИО: all name tokens (any order)");
    score = Math.max(score, 80);
  }

  if (query.morphology.lemmaTokens.length > 0 && score < 80) {
    const primaryLemma =
      query.morphology.normalizedSurname ??
      [...query.morphology.lemmaTokens].sort((a, b) => b.length - a.length)[0];
    const surnameHit = nameWords.some((word) =>
      tokensMatchWord(primaryLemma, word),
    );
    if (surnameHit) {
      matchedFields.push(`Фамилия/имя (lemma): «${primaryLemma}»`);
      score = Math.max(score, 68);
    }

    for (const lemma of query.morphology.lemmaTokens) {
      for (const word of nameWords) {
        if (!tokensMatchWord(lemma, word)) continue;
        if (score < 65) {
          matchedFields.push(`Имя (morph): «${lemma}» ~ «${word}»`);
          score = Math.max(score, lemma.length >= 5 ? 58 : 48);
        }
      }
    }
  }

  if (query.morphology.lemmaTokens.length > 0 && score < 65) {
    const searchTokens = [
      ...query.tokens,
      ...query.morphology.lemmaTokens,
    ];
    for (const field of noteFields) {
      const hay = normalizeText(field.value);
      const hit = searchTokens.some((token) => {
        if (hay.includes(token)) return true;
        return hay
          .split(/[^\p{L}\p{N}]+/u)
          .some((word) => tokensMatchWord(token, word));
      });
      if (hit) {
        matchedFields.push(`${field.label}: notes/comment match`);
        score = Math.max(score, 35);
      }
    }
  }

  return { score, matchedFields: [...new Set(matchedFields)] };
}

export const SCORE_AUTO = 80;
export const SCORE_STRONG = 65;
export const SCORE_VIABLE = 35;
/** Fuzzy-поиск для передачи кандидатов в AI. */
export const SCORE_FUZZY = 15;
/** Минимальный порог — ниже не показываем. */
export const SCORE_MIN = SCORE_VIABLE;
