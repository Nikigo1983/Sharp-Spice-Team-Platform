/** Базовая нормализация текста для поиска (без зависимостей от client-search). */

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e",
  ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.,()[\]{}«»"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function transliterate(value: string): string {
  return [...normalizeText(value)]
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join("");
}

export function normalizeComparable(value: string): string {
  return transliterate(normalizeText(value)).replace(/\s+/g, "");
}
