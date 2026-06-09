/**
 * Универсальная морфологическая нормализация русских имён и фамилий.
 * Приводит падежные формы к набору канонических вариантов для сравнения.
 */

import {
  normalizeComparable,
  normalizeText,
  transliterate,
} from "@/lib/ai/search-normalize";

export type NormalizedNameParts = {
  /** Исходные слова после очистки запроса */
  rawTokens: string[];
  /** Леммы / канонические формы каждого токена */
  lemmaTokens: string[];
  /** Все варианты для fuzzy-сравнения */
  matchKeys: string[];
  normalizedFullName: string;
  normalizedSurname: string | null;
  normalizedFirstName: string | null;
};

/** Правила: [regex на слово целиком, функция преобразования] */
type MorphRule = [RegExp, (stem: string) => string[]];

function isCyrillicWord(word: string): boolean {
  return /[а-яё]/i.test(word);
}

function addVariant(set: Set<string>, value: string): void {
  const v = normalizeText(value);
  if (v.length >= 2) set.add(v);
}

/** Женские фамилии на -ова/-ева/-ина/-ая */
const FEMININE_SURNAME_RULES: MorphRule[] = [
  [/^(.+(?:ова|ева|ина|ая|яя|ская|цкая))$/i, (w) => [w]],
  [/^(.+(?:ов|ев|ин|ын|ий|ой|ай|ей))ой$/i, (s) => [`${s}а`, `${s}ова`, `${s}ева`]],
  [/^(.+(?:ов|ев|ин|ын))ую$/i, (s) => [`${s}а`, `${s}ова`]],
  [/^(.+(?:ов|ев|ин|ын))ой$/i, (s) => [`${s}а`, `${s}ова`]],
  [/^(.+(?:ов|ев|ин|ын))у$/i, (s) => [`${s}а`, `${s}ова`, s]],
  [/^(.+(?:ов|ев|ин|ын))е$/i, (s) => [`${s}а`, `${s}ова`, s]],
  [/^(.+(?:ов|ев|ин|ын))и$/i, (s) => [`${s}а`, `${s}ова`, s]],
  [/^(.+(?:ов|ев|ин|ын))а$/i, (s) => [`${s}а`, s, `${s}ова`]],
];

/** Мужские фамилии на -ов/-ев/-ин/-ский/-ян */
const MASCULINE_SURNAME_RULES: MorphRule[] = [
  [/^(.+(?:ов|ев|ин|ын|ой|ий|ский|ской|цкий|цкой|ян|ian))$/i, (w) => [w]],
  [/^(.+(?:ов|ев|ин|ын|ск|цк))у$/i, (s) => [s, `${s}ов`, `${s}ев`]],
  [/^(.+(?:ов|ев|ин|ын|ск|цк))е$/i, (s) => [s, `${s}ов`, `${s}ев`]],
  [/^(.+(?:ов|ев|ин|ын|ск|цк))а$/i, (s) => [s, `${s}ов`, `${s}ев`]],
  [/^(.+(?:ов|ев|ин|ын|ск|цк))ом$/i, (s) => [s, `${s}ов`]],
  [/^(.+(?:ов|ев|ин|ын|ск|цк))ым$/i, (s) => [s, `${s}ов`]],
  [/^(.+(?:ов|ев|ин|ын|ск|цк))и$/i, (s) => [s, `${s}ов`]],
  [/^(.+(?:ян|ian))у$/i, (s) => [`${s}ян`, s]],
  [/^(.+(?:ян|ian))а$/i, (s) => [`${s}ян`, s]],
  [/^(.+(?:ян|ian))е$/i, (s) => [`${s}ян`, s]],
];

/** Имена женские на -а/-я/-ия */
const FEMININE_NAME_RULES: MorphRule[] = [
  [/^(.+(?:ия|ья|на|ра|ла|са|та|ка))$/i, (w) => [w]],
  [/^(.+?)ии$/i, (s) => [`${s}ия`, `${s}и`, `${s}а`, s]],
  [/^(.+?)ию$/i, (s) => [`${s}ия`, `${s}а`, s]],
  [/^(.+?)ией$/i, (s) => [`${s}ия`, `${s}а`, s]],
  [/^(.+?)и$/i, (s) => [`${s}а`, `${s}я`, s]],
  [/^(.+?)ой$/i, (s) => [`${s}а`, `${s}я`, s]],
  [/^(.+?)ей$/i, (s) => [`${s}я`, `${s}а`, s]],
  [/^(.+?)е$/i, (s) => [`${s}а`, `${s}я`, s]],
  [/^(.+?)у$/i, (s) => [`${s}а`, `${s}я`, s]],
  [/^(.+?)ы$/i, (s) => [`${s}а`, s]],
  [/^(.+?)ике$/i, (s) => [`${s}ика`, s]],
  [/^(.+?)икой$/i, (s) => [`${s}ика`, s]],
  [/^(.+?)ику$/i, (s) => [`${s}ика`, s]],
  [/^(.+?)ики$/i, (s) => [`${s}ика`, s]],
];

/** Имена мужские на -й/-ь/-ей */
const MASCULINE_NAME_RULES: MorphRule[] = [
  [/^(.+(?:ей|ай|ий|ь|й))$/i, (w) => [w]],
  [/^(.+?)я$/i, (s) => [`${s}й`, `${s}ей`, s]],
  [/^(.+?)ю$/i, (s) => [`${s}й`, `${s}ей`, s]],
  [/^(.+?)е$/i, (s) => [`${s}й`, `${s}ей`, s]],
  [/^(.+?)ем$/i, (s) => [`${s}й`, `${s}ей`, s]],
  [/^(.+?)ом$/i, (s) => [`${s}й`, s]],
  [/^(.+?)и$/i, (s) => [`${s}й`, s]],
  [/^(.+?)а$/i, (s) => [`${s}й`, `${s}ей`, s]],
  [/^(.+?)у$/i, (s) => [`${s}й`, `${s}ей`, s]],
];

const ALL_RULE_GROUPS = [
  FEMININE_SURNAME_RULES,
  MASCULINE_SURNAME_RULES,
  FEMININE_NAME_RULES,
  MASCULINE_NAME_RULES,
];

function applyMorphRules(word: string): string[] {
  const variants = new Set<string>();
  addVariant(variants, word);

  for (const rules of ALL_RULE_GROUPS) {
    for (const [pattern, expand] of rules) {
      const match = word.match(pattern);
      if (!match?.[1]) continue;
      for (const candidate of expand(match[1])) {
        addVariant(variants, candidate);
      }
    }
  }

  // Универсальное снятие односимвольного падежного окончания (fallback)
  if (word.length >= 5) {
    addVariant(variants, word.slice(0, -1));
  }
  if (word.length >= 6) {
    addVariant(variants, word.slice(0, -2));
  }

  return [...variants];
}

/** Все формы слова для сопоставления (леммы + транслит + comparable). */
export function getRussianNameLemmaVariants(word: string): string[] {
  const normalized = normalizeText(word);
  if (!normalized) return [];

  const variants = new Set<string>();
  addVariant(variants, normalized);

  if (isCyrillicWord(normalized)) {
    for (const form of applyMorphRules(normalized)) {
      addVariant(variants, form);
      addVariant(variants, transliterate(form));
    }
  } else {
    addVariant(variants, transliterate(normalized));
  }

  for (const form of [...variants]) {
    variants.add(normalizeComparable(form));
  }

  return [...variants].filter((v) => v.length >= 2);
}

/** Основная лемма — первый «полный» кириллический вариант. */
export function lemmatizeRussianNameWord(word: string): string {
  const variants = getRussianNameLemmaVariants(word);
  const cyrillic = variants.find((v) => /[а-яё]/i.test(v) && v.length >= 3);
  return cyrillic ?? variants[0] ?? normalizeText(word);
}

export function morphNameMatch(token: string, candidate: string): boolean {
  if (!token || !candidate) return false;

  const left = getRussianNameLemmaVariants(token);
  const right = getRussianNameLemmaVariants(candidate);

  for (const a of left) {
    for (const b of right) {
      if (a === b) return true;
      if (a.length >= 4 && b.length >= 4) {
        if (a.startsWith(b) || b.startsWith(a)) return true;
      }
    }
  }

  return false;
}

function guessSurnameAndFirstName(tokens: string[]): {
  surname: string | null;
  firstName: string | null;
} {
  if (tokens.length === 0) {
    return { surname: null, firstName: null };
  }
  if (tokens.length === 1) {
    const only = lemmatizeRussianNameWord(tokens[0]);
    return { surname: only, firstName: null };
  }

  const lemmas = tokens.map(lemmatizeRussianNameWord);
  const [first, second] = lemmas;

  const firstLooksSurname =
    /(?:ова|ева|ина|ский|ской|ян|ов|ев|ин)$/i.test(first) &&
    !/(?:ия|ина|ела)$/i.test(first);
  const secondLooksSurname = /(?:ова|ева|ина|ский|ской|ян|ов|ев|ин)$/i.test(
    second,
  );

  if (firstLooksSurname && !secondLooksSurname) {
    return { surname: first, firstName: second };
  }
  if (secondLooksSurname && !firstLooksSurname) {
    return { surname: second, firstName: first };
  }

  // По умолчанию: первое слово — имя, второе — фамилия (как в анкетах)
  return { surname: second, firstName: first };
}

export function buildNormalizedNameParts(tokens: string[]): NormalizedNameParts {
  const rawTokens = tokens.map((t) => normalizeText(t)).filter(Boolean);
  const lemmaTokens = rawTokens.map(lemmatizeRussianNameWord);
  const matchKeys = [
    ...new Set(rawTokens.flatMap((token) => getRussianNameLemmaVariants(token))),
  ];

  const { surname, firstName } = guessSurnameAndFirstName(rawTokens);
  const normalizedFullName = lemmaTokens.join(" ");

  return {
    rawTokens,
    lemmaTokens,
    matchKeys,
    normalizedFullName,
    normalizedSurname: surname,
    normalizedFirstName: firstName,
  };
}

export function formatNormalizedQueryLabel(parts: NormalizedNameParts): string {
  if (parts.lemmaTokens.length === 0) return "—";
  return parts.lemmaTokens.join(" ");
}

export function formatNormalizedQueryDebug(parts: NormalizedNameParts): string {
  const lines = [
    `Нормализовано: ${formatNormalizedQueryLabel(parts)}`,
  ];
  if (parts.normalizedSurname) {
    lines.push(`Фамилия (lemma): ${parts.normalizedSurname}`);
  }
  if (parts.normalizedFirstName) {
    lines.push(`Имя (lemma): ${parts.normalizedFirstName}`);
  }
  return lines.join("\n");
}
