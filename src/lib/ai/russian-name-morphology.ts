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

/**
 * Feminine surname case forms.
 * Stem already ends with ов/ев/ин/ын — never append another -ова/-ева
 * (that produced collisions like ратниковова ↔ бронниковова).
 */
function feminineSurnameFromStem(stem: string): string[] {
  return [`${stem}а`, stem];
}

/** Женские фамилии на -ова/-ева/-ина/-ая */
const FEMININE_SURNAME_RULES: MorphRule[] = [
  [/^(.+(?:ова|ева|ина|ая|яя|ская|цкая))$/i, (w) => [w]],
  [/^(.+(?:ов|ев|ин|ын|ий|ой|ай|ей))ой$/i, feminineSurnameFromStem],
  [/^(.+(?:ов|ев|ин|ын))ую$/i, feminineSurnameFromStem],
  [/^(.+(?:ов|ев|ин|ын))ой$/i, feminineSurnameFromStem],
  [/^(.+(?:ов|ев|ин|ын))у$/i, feminineSurnameFromStem],
  [/^(.+(?:ов|ев|ин|ын))е$/i, feminineSurnameFromStem],
  [/^(.+(?:ов|ев|ин|ын))и$/i, feminineSurnameFromStem],
  [/^(.+(?:ов|ев|ин|ын))а$/i, feminineSurnameFromStem],
];

/**
 * Masculine surname case forms.
 * Stem already ends with ов/ев/ин/ск… — do not append another -ов/-ев.
 */
function masculineSurnameFromStem(stem: string): string[] {
  return [stem];
}

/** Мужские фамилии на -ов/-ев/-ин/-ский/-ян */
const MASCULINE_SURNAME_RULES: MorphRule[] = [
  [/^(.+(?:ов|ев|ин|ын|ой|ий|ский|ской|цкий|цкой|ян|ian))$/i, (w) => [w]],
  [/^(.+(?:ов|ев|ин|ын|ск|цк))у$/i, masculineSurnameFromStem],
  [/^(.+(?:ов|ев|ин|ын|ск|цк))е$/i, masculineSurnameFromStem],
  [/^(.+(?:ов|ев|ин|ын|ск|цк))а$/i, masculineSurnameFromStem],
  [/^(.+(?:ов|ев|ин|ын|ск|цк))ом$/i, masculineSurnameFromStem],
  [/^(.+(?:ов|ев|ин|ын|ск|цк))ым$/i, masculineSurnameFromStem],
  [/^(.+(?:ов|ев|ин|ын|ск|цк))и$/i, masculineSurnameFromStem],
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

function looksLikeRussianSurname(word: string): boolean {
  return /(?:ова|ева|ина|ая|яя|ская|цкая|ский|ской|цкий|цкой|ян|ов|ев|ин|ын)$/i.test(
    word,
  );
}

function applyMorphRules(word: string): string[] {
  const variants = new Set<string>();
  addVariant(variants, word);

  const ruleGroups = looksLikeRussianSurname(word)
    ? [FEMININE_SURNAME_RULES, MASCULINE_SURNAME_RULES]
    : ALL_RULE_GROUPS;

  for (const rules of ruleGroups) {
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

/**
 * Prefix match for names/surnames: allow short morphological tails only.
 * Rejects false positives like «Олефир» ↔ «Олег» (shared «олег» prefix).
 */
export function nameStemsCompatible(a: string, b: string): boolean {
  const left = normalizeComparable(a);
  const right = normalizeComparable(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length < 4 || right.length < 4) return false;

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  if (!longer.startsWith(shorter)) return false;

  const ratio = shorter.length / longer.length;
  if (ratio >= 0.8) return true;

  const tail = longer.slice(shorter.length);
  // Common Russian case / soft endings only — not an extra name root.
  return (
    tail.length <= 3 &&
    /^(а|у|е|ы|и|ю|я|ой|ом|ым|ых|ей|ью|ём|ем)$/i.test(tail)
  );
}

export function morphNameMatch(token: string, candidate: string): boolean {
  if (!token || !candidate) return false;

  const left = getRussianNameLemmaVariants(token);
  const right = getRussianNameLemmaVariants(candidate);

  for (const a of left) {
    for (const b of right) {
      if (a === b) return true;
      if (a.length >= 4 && b.length >= 4 && nameStemsCompatible(a, b)) {
        return true;
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

export type RussianNameGender = "female" | "male" | "unknown";

function preserveNameCase(sample: string, inflected: string): string {
  if (!sample || !inflected) return inflected;
  if (sample === sample.toUpperCase() && /[А-ЯЁA-Z]/.test(sample)) {
    return inflected.toLocaleUpperCase("ru-RU");
  }
  if (sample === sample.toLowerCase()) {
    return inflected.toLocaleLowerCase("ru-RU");
  }
  // Title-case each word from inflected, keep sample's per-word style when possible.
  const sampleWords = sample.split(/\s+/);
  const outWords = inflected.split(/\s+/);
  return outWords
    .map((word, index) => {
      const src = sampleWords[index] ?? sampleWords[0] ?? word;
      if (src === src.toUpperCase() && /[А-ЯЁA-Z]/.test(src)) {
        return word.toLocaleUpperCase("ru-RU");
      }
      if (src[0] && src[0] === src[0].toLocaleUpperCase("ru-RU")) {
        return (
          word.charAt(0).toLocaleUpperCase("ru-RU") +
          word.slice(1).toLocaleLowerCase("ru-RU")
        );
      }
      return word;
    })
    .join(" ");
}

function replaceSuffixCaseAware(
  word: string,
  fromSuffix: string,
  toSuffix: string,
): string {
  if (word.length < fromSuffix.length) return word;
  const stem = word.slice(0, -fromSuffix.length);
  return preserveNameCase(word, stem + toSuffix);
}

/** Infer gender from FIO and/or the form used in the manager query. */
export function inferRussianPersonGender(
  displayName: string,
  queryHint?: string | null,
): RussianNameGender {
  const hint = queryHint?.trim().toLowerCase() ?? "";
  if (hint) {
    if (/(?:овой|евой|иной|ыной|ской|цкой|ую|ей)$/i.test(hint)) {
      return "female";
    }
    if (/(?:ову|еву|ину|ыну|ского|скому|ским)$/i.test(hint)) {
      return "male";
    }
  }

  const tokens = displayName
    .trim()
    .split(/[^\p{L}\p{N}\-']+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  for (const token of tokens) {
    const t = token.toLowerCase();
    if (/(?:ова|ева|ина|ына|ая|яя|ская|цкая)$/i.test(t)) return "female";
  }
  for (const token of tokens) {
    const t = token.toLowerCase();
    if (/(?:ский|цкой|ян)$/i.test(t)) return "male";
    if (/(?:ов|ев|ин|ын)$/i.test(t) && !/(?:ова|ева|ина|ына)$/i.test(t)) {
      return "male";
    }
  }

  for (const token of tokens) {
    const t = token.toLowerCase();
    if (
      /^(?:анна|мария|марья|елена|ольга|наталья|татьяна|ирина|екатерина|юлия|дарья|алина|виктория|полина|ксения|софья|софия|любовь|надежда|вера|галина|лариса|светлана|валентина|людмила|марина|нина|зинаида|евгения|александра)$/i.test(
        t,
      ) ||
      /(?:ия|ья|на|ра|ла|са|та|ка|га|да|ва|ша|ня)$/i.test(t)
    ) {
      // Avoid treating surname stems as first names when already classified.
      if (!/(?:ов|ев|ин|ын|ский)$/i.test(t)) return "female";
    }
    if (
      /^(?:александр|алексей|андрей|борис|вадим|василий|виктор|владимир|дмитрий|евгений|иван|игорь|кирилл|константин|леонид|максим|михаил|николай|олег|павел|пётр|петр|роман|сергей|степан|фёдор|федор|юрий|яков)$/i.test(
        t,
      )
    ) {
      return "male";
    }
  }

  return "unknown";
}

function inflectSurnameToGenitive(
  surname: string,
  gender: RussianNameGender,
): string {
  const lower = surname.toLowerCase();

  const asFemale =
    gender === "female" ||
    (gender === "unknown" &&
      /(?:ова|ева|ина|ына|ая|яя|ская|цкая)$/i.test(lower));
  const asMale =
    gender === "male" ||
    (gender === "unknown" &&
      /(?:ов|ев|ин|ын|ский|цкий|ян)$/i.test(lower) &&
      !/(?:ова|ева|ина|ына)$/i.test(lower));

  if (asFemale) {
    if (/ова$/i.test(surname)) return replaceSuffixCaseAware(surname, "ова", "овой");
    if (/ева$/i.test(surname)) return replaceSuffixCaseAware(surname, "ева", "евой");
    if (/ёва$/i.test(surname)) return replaceSuffixCaseAware(surname, "ёва", "ёвой");
    if (/ина$/i.test(surname)) return replaceSuffixCaseAware(surname, "ина", "иной");
    if (/ына$/i.test(surname)) return replaceSuffixCaseAware(surname, "ына", "ыной");
    if (/ская$/i.test(surname)) return replaceSuffixCaseAware(surname, "ская", "ской");
    if (/цкая$/i.test(surname)) return replaceSuffixCaseAware(surname, "цкая", "цкой");
    if (/ая$/i.test(surname)) return replaceSuffixCaseAware(surname, "ая", "ой");
    if (/яя$/i.test(surname)) return replaceSuffixCaseAware(surname, "яя", "ей");
  }

  if (asMale) {
    if (/ский$/i.test(surname)) return replaceSuffixCaseAware(surname, "ский", "ского");
    if (/цкий$/i.test(surname)) return replaceSuffixCaseAware(surname, "цкий", "цкого");
    if (/ой$/i.test(surname)) return replaceSuffixCaseAware(surname, "ой", "ого");
    if (/ов$/i.test(surname)) return replaceSuffixCaseAware(surname, "ов", "ова");
    if (/ев$/i.test(surname)) return replaceSuffixCaseAware(surname, "ев", "ева");
    if (/ёв$/i.test(surname)) return replaceSuffixCaseAware(surname, "ёв", "ёва");
    if (/ин$/i.test(surname)) return replaceSuffixCaseAware(surname, "ин", "ина");
    if (/ын$/i.test(surname)) return replaceSuffixCaseAware(surname, "ын", "ына");
    if (/ян$/i.test(surname)) return replaceSuffixCaseAware(surname, "ян", "яна");
  }

  return surname;
}

function inflectGivenNameToGenitive(
  name: string,
  gender: RussianNameGender,
): string {
  const lower = name.toLowerCase();
  if (gender === "female" || /(?:а|я)$/i.test(lower)) {
    if (/ия$/i.test(name)) return replaceSuffixCaseAware(name, "ия", "ии");
    if (/ья$/i.test(name)) return replaceSuffixCaseAware(name, "ья", "ьи");
    if (/а$/i.test(name)) {
      // Анна → Анны, Ольга → Ольги
      if (/[гкхжшщч]$/i.test(name.slice(0, -1))) {
        return replaceSuffixCaseAware(name, "а", "и");
      }
      return replaceSuffixCaseAware(name, "а", "ы");
    }
    if (/я$/i.test(name)) return replaceSuffixCaseAware(name, "я", "и");
    if (/ь$/i.test(name)) return replaceSuffixCaseAware(name, "ь", "и");
  }
  if (gender === "male" || gender === "unknown") {
    if (/ий$/i.test(name)) return replaceSuffixCaseAware(name, "ий", "ия");
    if (/ей$/i.test(name)) return replaceSuffixCaseAware(name, "ей", "ея");
    if (/ай$/i.test(name)) return replaceSuffixCaseAware(name, "ай", "ая");
    if (/й$/i.test(name)) return replaceSuffixCaseAware(name, "й", "я");
    if (/ь$/i.test(name)) return replaceSuffixCaseAware(name, "ь", "я");
    if (/[бвгджзклмнпрстфхцчшщ]$/i.test(name)) {
      return preserveNameCase(name, `${name}а`);
    }
  }
  return name;
}

function tokenLooksLikeSurname(token: string): boolean {
  return /(?:ова|ева|ина|ына|ая|ская|цкая|ский|цкой|ян|ов|ев|ин|ын)$/i.test(
    token,
  );
}

/**
 * Genitive (родительный) for phrases like «У … долг».
 * Uses FIO heuristics and optional query hint («Пермяковой» → female).
 */
export function inflectRussianPersonNameGenitive(
  displayName: string,
  queryHint?: string | null,
): string {
  const trimmed = displayName.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;

  const gender = inferRussianPersonGender(trimmed, queryHint);
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 1) {
    const only = tokens[0]!;
    return tokenLooksLikeSurname(only)
      ? inflectSurnameToGenitive(only, gender)
      : inflectGivenNameToGenitive(only, gender);
  }

  // Typical CRM: «Фамилия Имя» or «Фамилия Имя Отчество»
  const [first, ...rest] = tokens;
  if (tokenLooksLikeSurname(first!)) {
    return [
      inflectSurnameToGenitive(first!, gender),
      ...rest.map((token, index) => {
        if (index === 0) return inflectGivenNameToGenitive(token, gender);
        if (/овна$/i.test(token)) return replaceSuffixCaseAware(token, "овна", "овны");
        if (/евна$/i.test(token)) return replaceSuffixCaseAware(token, "евна", "евны");
        if (/ична$/i.test(token)) return replaceSuffixCaseAware(token, "ична", "ичны");
        if (/(?:ович|евич)$/i.test(token)) return preserveNameCase(token, `${token}а`);
        if (/ич$/i.test(token)) return preserveNameCase(token, `${token}а`);
        return token;
      }),
    ].join(" ");
  }

  // «Имя Фамилия»
  if (rest.length >= 1 && tokenLooksLikeSurname(rest[rest.length - 1]!)) {
    const surname = rest[rest.length - 1]!;
    const given = [first!, ...rest.slice(0, -1)];
    return [
      ...given.map((token) => inflectGivenNameToGenitive(token, gender)),
      inflectSurnameToGenitive(surname, gender),
    ].join(" ");
  }

  return tokens
    .map((token, index) =>
      index === 0
        ? inflectGivenNameToGenitive(token, gender)
        : tokenLooksLikeSurname(token)
          ? inflectSurnameToGenitive(token, gender)
          : token,
    )
    .join(" ");
}

/** «У Пермяковой» / «У Иванова» with correct gender/case. */
export function formatRussianNamePossessiveU(
  displayName: string,
  queryHint?: string | null,
): string {
  return `У **${inflectRussianPersonNameGenitive(displayName, queryHint)}**`;
}
