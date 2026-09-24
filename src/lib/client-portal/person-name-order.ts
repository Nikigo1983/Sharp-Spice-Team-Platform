/**
 * Cyrillic person-name order: FIO (фамилия имя отчество) ↔ IOF (имя отчество фамилия).
 * Pure module — usable from Node scripts.
 */

function cleanSpaces(value: string): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikePatronymic(token: string): boolean {
  return /(?:ович|евич|овна|евна|ична|инична)$/i.test(token);
}

const GIVEN_NAMES = new Set(
  [
    "александр",
    "алексей",
    "анатолий",
    "андрей",
    "антон",
    "артем",
    "артём",
    "борис",
    "вадим",
    "валентин",
    "василий",
    "виктор",
    "виталий",
    "владимир",
    "владислав",
    "вячеслав",
    "геннадий",
    "георгий",
    "григорий",
    "дмитрий",
    "евгений",
    "егор",
    "иван",
    "игорь",
    "илья",
    "кирилл",
    "константин",
    "леонид",
    "максим",
    "михаил",
    "николай",
    "олег",
    "павел",
    "пётр",
    "петр",
    "роман",
    "руслан",
    "сергей",
    "станислав",
    "степан",
    "тимофей",
    "фёдор",
    "федор",
    "юрий",
    "ярослав",
    "александра",
    "алина",
    "алла",
    "анастасия",
    "ангелина",
    "анна",
    "валентина",
    "валерия",
    "вера",
    "виктория",
    "галина",
    "дарья",
    "евгения",
    "екатерина",
    "елена",
    "жанна",
    "зинаида",
    "инна",
    "ирина",
    "кристина",
    "ксения",
    "лариса",
    "лидия",
    "любовь",
    "людмила",
    "маргарита",
    "марина",
    "мария",
    "надежда",
    "наталья",
    "нина",
    "оксана",
    "ольга",
    "полина",
    "раиса",
    "светлана",
    "софия",
    "софья",
    "тамара",
    "татьяна",
    "ульяна",
    "юлия",
    "яна",
  ].map((s) => s.toLowerCase()),
);

function looksLikeGivenName(token: string): boolean {
  const t = token.toLowerCase();
  if (looksLikePatronymic(t)) return false;
  if (GIVEN_NAMES.has(t)) return true;
  // Feminine given ending -а/-я that is not a typical surname ending
  if (/[ая]$/i.test(t) && !/(?:ова|ева|ёва|ская|цкая|ая)$/i.test(t)) {
    return true;
  }
  return false;
}

function looksLikeSurname(token: string): boolean {
  const t = token.toLowerCase();
  if (looksLikePatronymic(t)) return false;
  if (GIVEN_NAMES.has(t)) return false;
  return (
    /(?:ов|ев|ёв|ин|ын|ский|ская|цкий|цкая|енко|ук|юк|ус|ян|дзе|швили)$/i.test(
      t,
    ) || /(?:ова|ева|ёва|ина|ына|ая)$/i.test(t)
  );
}

/**
 * Reorder a Cyrillic full name to Имя Отчество Фамилия when it looks like
 * Фамилия Имя [Отчество]. Idempotent for names already in IOF.
 */
export function formatCyrillicNameIof(raw: string): string {
  const name = cleanSpaces(raw);
  if (!name) return "";
  // Skip names with Latin commas / passport-style punctuation
  if (/[,;]/.test(name) || /[a-z]/i.test(name)) return name;

  const tokens = name.split(" ");
  if (tokens.length < 2) return name;

  if (tokens.length === 2) {
    const [a, b] = tokens as [string, string];
    // Already «Имя Фамилия»
    if (looksLikeGivenName(a) && looksLikeSurname(b)) return name;
    // «Фамилия Имя» → «Имя Фамилия»
    if (looksLikeSurname(a) && looksLikeGivenName(b)) return `${b} ${a}`;
    if (looksLikeSurname(a) && !looksLikeSurname(b)) return `${b} ${a}`;
    return name;
  }

  if (tokens.length === 3) {
    const [a, b, c] = tokens as [string, string, string];
    // Already «Имя Отчество Фамилия»
    if (looksLikePatronymic(b) && (looksLikeSurname(c) || !looksLikePatronymic(c))) {
      if (looksLikeGivenName(a) || !looksLikeSurname(a)) return name;
    }
    if (looksLikePatronymic(b) && looksLikeSurname(c)) return name;
    // «Фамилия Имя Отчество» → «Имя Отчество Фамилия»
    if (looksLikePatronymic(c) && !looksLikePatronymic(b)) {
      return `${b} ${c} ${a}`;
    }
    // «Фамилия Имя …» without clear patronymic but first looks like surname
    if (looksLikeSurname(a) && (looksLikeGivenName(b) || !looksLikeSurname(b))) {
      return `${b} ${c} ${a}`;
    }
    return name;
  }

  // 4+ tokens: if last is patronymic-like, treat first as surname (FIO…).
  const last = tokens[tokens.length - 1]!;
  const first = tokens[0]!;
  if (looksLikePatronymic(last) && looksLikeSurname(first)) {
    return [...tokens.slice(1), first].join(" ");
  }
  return name;
}

/** Latin placeholder-style names: SURNAME GIVEN → GIVEN SURNAME when 2–3 tokens. */
export function formatLatinNameIof(raw: string): string {
  const name = cleanSpaces(raw);
  if (!name) return "";
  const tokens = name.split(" ");
  if (tokens.length === 2) {
    const [a, b] = tokens as [string, string];
    if (/^[A-ZÀ-ÖØ-Þ]+$/.test(a) && /^[A-ZÀ-ÖØ-Þ]+$/.test(b)) {
      return `${b} ${a}`;
    }
  }
  if (tokens.length === 3) {
    const [a, b, c] = tokens as [string, string, string];
    return `${b} ${c} ${a}`;
  }
  return name;
}
