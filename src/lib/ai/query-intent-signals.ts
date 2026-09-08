import { extractPersonNameTokens } from "@/lib/ai/name-matching";

/** Номер паспорта из таблицы «Клиенты», а не скан/PDF в Drive. */
export function isPassportNumberLookupQuery(query: string): boolean {
  const lower = query.toLowerCase();
  if (
    /номер\s+(?:загран(?:ичного)?\s+)?паспорта/iu.test(query) ||
    /паспорт\s*(?:номер|№|no\.?)/iu.test(query)
  ) {
    return true;
  }
  if (!lower.includes("паспорт")) return false;
  if (
    lower.includes("скан") ||
    lower.includes("копи") ||
    lower.includes("pdf") ||
    lower.includes("drive") ||
    lower.includes("файл") ||
    (lower.includes("документ") && !lower.includes("номер"))
  ) {
    return false;
  }
  const hasClientName =
    extractPersonNameTokens(query).length > 0 ||
    /(?:клиент[а-я]*|у)\s+[а-яё\-]{3,}/iu.test(query);
  return (
    hasClientName ||
    lower.includes("какой") ||
    lower.includes("какая") ||
    lower.includes("скажи")
  );
}

/** Запрос про папку «ЭМИГРАНТ» в Google Drive, а не про таблицы клиентов. */
export function isEmigrantDrivePrimaryQuery(query: string): boolean {
  const lower = query.toLowerCase();
  return (
    lower.includes("эмигрант") ||
    lower.includes("emigrant folder") ||
    lower.includes("emigrant drive") ||
    (lower.includes("папк") &&
      (lower.includes("эмигрант") || lower.includes("emigrant")))
  );
}
