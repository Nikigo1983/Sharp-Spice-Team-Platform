/**
 * Извлечение сущности клиента из естественного языка перед Client Lookup.
 */

import {
  buildNormalizedNameParts,
  lemmatizeRussianNameWord,
  type NormalizedNameParts,
} from "@/lib/ai/russian-name-morphology";
import { redactForLogging } from "@/lib/ai/context-redaction";
import { normalizeText } from "@/lib/ai/search-normalize";

const QUERY_STOP_WORDS = new Set([
  "из",
  "наш",
  "нашего",
  "нашей",
  "наше",
  "нас",
  "нам",
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
  "какое",
  "номер",
  "текущий",
  "статус",
  "клиент",
  "клиента",
  "клиентку",
  "клиентке",
  "клиенткой",
  "клиентом",
  "клиентов",
  "клиентка",
  "клиентки",
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
  "нем",
  "ней",
  "нам",
  "вам",
  "ли",
  "этот",
  "этой",
  "этом",
  "этого",
  "профиль",
  "профиля",
  "профилю",
  "происходит",
  "происходят",
  "случается",
  "случилось",
]);

const PHRASE_NOISE = new Set([
  "нас",
  "нам",
  "вас",
  "них",
  "нем",
  "ней",
  "нему",
  "ли",
  "есть",
]);

export type ClientEntityExtraction = {
  extractedPhrase: string;
  tokens: string[];
  morphology: NormalizedNameParts;
  normalizedPhrase: string;
  searchPhrase: string;
};

const NAME_CHUNK =
  String.raw`([\p{L}][\p{L}'\u2019-]*(?:\s+[\p{L}][\p{L}'\u2019-]*){0,2})`;

const ENTITY_PATTERNS: RegExp[] = [
  new RegExp(
    `по\\s+клиент(?:ка|ки|ку|ке|ом|у|а|ов)?\\s+${NAME_CHUNK}`,
    "iu",
  ),
  new RegExp(
    `(?:профиль|данны(?:е|х)|информаци(?:я|ю|и))\\s+(?:у\\s+нас\\s+)?(?:есть\\s+)?(?:по\\s+)?клиент(?:а|у|ке|ом|ка|ки|ов)?\\s+${NAME_CHUNK}`,
    "iu",
  ),
  new RegExp(
    `(?:что\\s+происходит\\s+)?(?:с\\s+)?клиент(?:ом|а|у|ке|ка|ки|ов)?\\s+${NAME_CHUNK}`,
    "iu",
  ),
  new RegExp(`(?:у\\s+нас\\s+)?(?:есть\\s+)?по\\s+${NAME_CHUNK}`, "iu"),
  new RegExp(
    `(?:информаци(?:я|ю|и)|данны(?:е|х))\\s+(?:у\\s+нас\\s+)?(?:есть\\s+)?по\\s+${NAME_CHUNK}`,
    "iu",
  ),
  new RegExp(
    `(?:найди|покажи|дай|расскажи|есть\\s+ли).*?(?:о|об|про|по)\\s+${NAME_CHUNK}`,
    "iu",
  ),
  new RegExp(`(?:о|об|про)\\s+${NAME_CHUNK}`, "iu"),
  new RegExp(`по\\s+${NAME_CHUNK}\\s*[?.!]?$`, "iu"),
  new RegExp(`клиент(?:ка|ки|ку|ке|ом|у|а|ов)?\\s+${NAME_CHUNK}`, "iu"),
];

function isNameLikeToken(token: string): boolean {
  return token.length >= 2 && /^[\p{L}][\p{L}\p{N}'-]*$/u.test(token);
}

function cleanNameTokens(raw: string): string[] {
  return raw
    .split(/[^\p{L}\p{N}'-]+/u)
    .map((token) => normalizeText(token))
    .filter(
      (token) =>
        token.length >= 3 &&
        isNameLikeToken(token) &&
        !QUERY_STOP_WORDS.has(token) &&
        !PHRASE_NOISE.has(token),
    );
}

function buildExtraction(rawPhrase: string, tokens: string[]): ClientEntityExtraction {
  const morphology = buildNormalizedNameParts(tokens);
  const normalizedTokens = morphology.lemmaTokens.map(lemmatizeRussianNameWord);
  const normalizedPhrase =
    morphology.normalizedFullName || normalizedTokens.join(" ");

  return {
    extractedPhrase: rawPhrase.trim(),
    tokens,
    morphology,
    normalizedPhrase,
    searchPhrase: normalizedPhrase || tokens.join(" "),
  };
}

/** Шаг 1–2: выделить ФИО из фразы и нормализовать падеж. */
export function extractClientEntityFromQuery(
  query: string,
): ClientEntityExtraction | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  for (const pattern of ENTITY_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match?.[1]) continue;

    const tokens = cleanNameTokens(match[1]);
    if (tokens.length > 0) {
      return buildExtraction(match[1], tokens);
    }
  }

  return null;
}

export function logClientEntityExtraction(
  rawQuery: string,
  extraction: ClientEntityExtraction | null,
  result?: { kind: string; clientName?: string },
): void {
  console.log("=== CLIENT LOOKUP ===");
  console.log("Запрос:", redactForLogging(rawQuery));
  console.log("Извлечено:", extraction?.extractedPhrase ?? "—");
  console.log("Нормализовано:", extraction?.normalizedPhrase ?? "—");
  console.log("Поиск:", extraction?.searchPhrase ?? "—");

  if (result?.kind === "single" && result.clientName) {
    console.log("Результат:", `Найден клиент ${result.clientName}`);
  } else if (result?.kind === "not_found") {
    console.log("Результат:", "Клиент не найден");
  } else if (result?.kind === "multiple") {
    console.log("Результат:", "Найдено несколько клиентов");
  } else if (result?.kind === "weak") {
    console.log("Результат:", "Слабые совпадения");
  } else if (result?.kind === "skip") {
    console.log("Результат:", "Поиск клиента пропущен");
  }

  console.log("==========================");
}
