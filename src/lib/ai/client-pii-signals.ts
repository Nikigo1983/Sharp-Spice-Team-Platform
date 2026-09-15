/**
 * Lightweight client-PII signals in free text (Security Gate 1).
 * Used to block web search and flag privacy-sensitive model calls.
 * No real client fixtures.
 */

const CYRILLIC_SURNAME_RE =
  /[А-ЯЁ][а-яё'’\-]{1,}(?:ов|ова|овой|ев|ева|евой|ёв|ёва|ёвой|ин|ина|иной|ын|ына|ыной|ский|ская|ской|цкий|цкая|цкой|ук|юк|енко|ко)(?![а-яё])/iu;

/** Prefer "First Last" to avoid matching country/org tokens like Croatia. */
const LATIN_FULL_NAME_RE = /\b[A-Z][a-z'’\-]{2,}\s+[A-Z][a-z'’\-]{2,}\b/;

const CLIENT_TASK_CUE_RE =
  /клиент|долг|договор|оплат|паспорт|email|почт|телефон|букинг|адрес|статус|дело|анкет|внж|письмо|сколько\s+долж/i;

const STRONG_PII_FIELD_CUE_RE =
  /паспорт|email|почт|телефон|букинг|адрес\s+прожив|номер\s+паспорта/i;

/** True when the string likely carries client identity/contact/finance cues. */
export function queryLooksLikeClientPii(query: string): boolean {
  const q = query.trim();
  if (!q) return false;

  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(q)) return true;
  if (/\+?\d[\d\s\-()]{8,}\d/.test(q)) return true;
  if (/\b\d{6,12}\b/.test(q) && /паспорт|passport/i.test(q)) return true;

  const hasCyrillicSurname = CYRILLIC_SURNAME_RE.test(q);
  const hasLatinFullName = LATIN_FULL_NAME_RE.test(q);
  const hasPersonToken = hasCyrillicSurname || hasLatinFullName;

  if (hasPersonToken && CLIENT_TASK_CUE_RE.test(q)) return true;
  if (hasPersonToken && STRONG_PII_FIELD_CUE_RE.test(q)) return true;

  // "email у Ивановой" / "паспорт Тестова" without full task verbs.
  if (STRONG_PII_FIELD_CUE_RE.test(q) && hasCyrillicSurname) return true;

  return false;
}
