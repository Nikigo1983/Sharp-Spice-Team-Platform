import "server-only";

import {
  createChatCompletion,
  type ChatMessage,
} from "@/lib/ai/openai";
import { isAiConfigured } from "@/lib/ai/config";
import { extractClientEntityFromQuery } from "@/lib/ai/client-entity-extract";
import {
  extractEmailFromQuery,
  extractPhoneFromQuery,
} from "@/lib/ai/client-search";
import {
  extractAllMonthsFromQuery,
  extractYearFromQuery,
  formatMonthsForIntent,
  isBookingDateQuery,
  isSubmissionDateQuery,
  MONTH_PATTERNS,
  queryContainsDateLiteral,
} from "@/lib/ai/client-date-parse";
import { looksLikePassportNumber } from "@/lib/ai/format-client";
import { normalizeComparable } from "@/lib/ai/search-normalize";

export type ClientSearchIntent = {
  clientName: string | null;
  country: string | null;
  direction: string | null;
  manager: string | null;
  status: string | null;
  address: string | null;
  city: string | null;
  passport: string | null;
  email: string | null;
  phone: string | null;
  notesContains: string | null;
  gender: "female" | "male" | null;
  bookingMonth: number | null;
  bookingYear: number | null;
  submittedMonths: number[];
  submittedYear: number | null;
  recentActivity: boolean;
  freeText: string[];
  isListQuery: boolean;
};

/** Максимум клиентов в контексте Claude для списочных запросов. */
export const LIST_QUERY_CLIENT_LIMIT = 50;

/** Сколько клиентов Claude показывает в ответе, если найдено больше. */
export const LIST_QUERY_DISPLAY_LIMIT = 20;

export type ClientSearchIntentType = "list" | "single";

export const EMPTY_CLIENT_SEARCH_INTENT: ClientSearchIntent = {
  clientName: null,
  country: null,
  direction: null,
  manager: null,
  status: null,
  address: null,
  city: null,
  passport: null,
  email: null,
  phone: null,
  notesContains: null,
  gender: null,
  bookingMonth: null,
  bookingYear: null,
  submittedMonths: [],
  submittedYear: null,
  recentActivity: false,
  freeText: [],
  isListQuery: false,
};

const MONTH_PATTERNS_LEGACY = MONTH_PATTERNS;

const INTENT_SYSTEM_PROMPT = `You extract structured client search filters from manager queries for an immigration CRM (Google Sheets).
Return ONLY valid JSON (no markdown, no comments). Use null for unknown fields.

Schema:
{
  "clientName": string | null,
  "country": string | null,
  "direction": string | null,
  "manager": string | null,
  "status": string | null,
  "address": string | null,
  "city": string | null,
  "passport": string | null,
  "email": string | null,
  "phone": string | null,
  "notesContains": string | null,
  "gender": "female" | "male" | null,
  "bookingMonth": number | null,
  "bookingYear": number | null,
  "submittedMonths": number[],
  "submittedYear": number | null,
  "recentActivity": boolean,
  "freeText": string[],
  "isListQuery": boolean
}

Rules:
- "у кого", "покажи клиентов", "покажи всех клиентов", "найди клиентов", "клиенты менеджера/референта", "клиенты по Хорватии", "кто находится в работе" → isListQuery: true
- "заявки подавали в январе и феврале", "дата подачи в марте" → isListQuery: true, submittedMonths: [1,2] or [3], submittedYear if year mentioned
- "референт Saša Merunka" / "референта X" → manager: "Saša Merunka", isListQuery: true if asking for a list
- For list queries, clientName is null unless asking about one specific person by name
- "девушку", "женщину" → gender: "female"
- "недавно" in activity context → recentActivity: true
- Extract passport as digits only when clearly a passport number, not a calendar date
- bookingMonth/bookingYear: only for booking end dates ("букинг", "booking")
- submittedMonths: 1-12 array for "дата подачи", "подавали заявку", "заявки в январе"
- notesContains: key phrases like "куратор", "запрос куратору"
- country/direction: e.g. "Хорватия", "Croatia"
- city: e.g. "Загреб", "Zagreb" — also set address if query mentions address in city`;

function normalizeSubmittedMonths(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item): item is number => typeof item === "number")
      .filter((month) => month >= 1 && month <= 12),
  )].sort((left, right) => left - right);
}

function normalizeIntent(raw: Partial<ClientSearchIntent>): ClientSearchIntent {
  const bookingMonth =
    typeof raw.bookingMonth === "number" &&
    raw.bookingMonth >= 1 &&
    raw.bookingMonth <= 12
      ? raw.bookingMonth
      : null;
  const bookingYear =
    typeof raw.bookingYear === "number" && raw.bookingYear >= 2000
      ? raw.bookingYear
      : null;
  const submittedYear =
    typeof raw.submittedYear === "number" && raw.submittedYear >= 2000
      ? raw.submittedYear
      : null;

  return {
    clientName: typeof raw.clientName === "string" ? raw.clientName.trim() || null : null,
    country: typeof raw.country === "string" ? raw.country.trim() || null : null,
    direction: typeof raw.direction === "string" ? raw.direction.trim() || null : null,
    manager: typeof raw.manager === "string" ? raw.manager.trim() || null : null,
    status: typeof raw.status === "string" ? raw.status.trim() || null : null,
    address: typeof raw.address === "string" ? raw.address.trim() || null : null,
    city: typeof raw.city === "string" ? raw.city.trim() || null : null,
    passport:
      typeof raw.passport === "string"
        ? raw.passport.replace(/\D/g, "") || null
        : null,
    email: typeof raw.email === "string" ? raw.email.trim().toLowerCase() || null : null,
    phone:
      typeof raw.phone === "string"
        ? raw.phone.replace(/\D/g, "") || null
        : null,
    notesContains:
      typeof raw.notesContains === "string" ? raw.notesContains.trim() || null : null,
    gender: raw.gender === "female" || raw.gender === "male" ? raw.gender : null,
    bookingMonth,
    bookingYear,
    submittedMonths: normalizeSubmittedMonths(raw.submittedMonths),
    submittedYear,
    recentActivity: raw.recentActivity === true,
    freeText: Array.isArray(raw.freeText)
      ? raw.freeText
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
    isListQuery: raw.isListQuery === true,
  };
}

function parseJsonIntent(content: string): ClientSearchIntent | null {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ClientSearchIntent>;
    return normalizeIntent(parsed);
  } catch {
    return null;
  }
}

async function extractClientSearchIntentWithAi(
  query: string,
): Promise<ClientSearchIntent | null> {
  const messages: ChatMessage[] = [
    { role: "system", content: INTENT_SYSTEM_PROMPT },
    { role: "user", content: query },
  ];

  const content = await createChatCompletion(messages, {
    temperature: 0,
    maxTokens: 400,
  });
  if (!content) return null;
  return parseJsonIntent(content);
}

export function parseClientSearchIntentRules(query: string): ClientSearchIntent {
  const intent: ClientSearchIntent = { ...EMPTY_CLIENT_SEARCH_INTENT };
  const lower = query.toLowerCase();

  const email = extractEmailFromQuery(query);
  if (email) intent.email = email;

  const phone = extractPhoneFromQuery(query);
  if (phone) intent.phone = phone;

  const passportMatch = query.match(/\b([A-Za-zА-Яа-я]{0,3}\d{6,12})\b/u);
  const passportCandidate = passportMatch?.[1]?.replace(/\s/g, "") ?? "";
  if (
    passportCandidate &&
    looksLikePassportNumber(passportCandidate) &&
    !queryContainsDateLiteral(query)
  ) {
    intent.passport = passportCandidate.replace(/\D/g, "") || passportCandidate;
  }

  const staffPatterns = [
    /(?:покажи|найди)\s+клиент[а-яё]*\s+(?:менеджер[а]?|референт[а]?|referent)\s+([a-zA-Zà-žÀ-Žа-яА-ЯёЁ\sšžćčđŠŽĆČĐ\-'.]+)/iu,
    /клиент[а-яё]*\s+(?:менеджер[а]?|референт[а]?|referent)\s+([a-zA-Zà-žÀ-Žа-яА-ЯёЁ\sšžćčđŠŽĆČĐ\-'.]+)/iu,
    /(?:менеджер[а]?|manager|референт[а]?|referent)\s+([a-zA-Zà-žÀ-Žа-яА-ЯёЁ\sšžćčđŠŽĆČĐ\-'.]+)/iu,
  ];
  for (const pattern of staffPatterns) {
    const match = query.match(pattern);
    if (match?.[1]) {
      intent.manager = match[1].trim().replace(/[.,!?]+$/u, "");
      break;
    }
  }

  if (/адрес\s+отправлен/i.test(query)) {
    intent.status = "адрес отправлен";
  } else if (/у\s+кого.*статус/i.test(query)) {
    const tail = query.match(/статус\s+(.+)/iu)?.[1]?.trim();
    if (tail && tail.length >= 3) intent.status = tail;
  } else if (/статус\s+(?:у\s+)?(?:клиент[а-я]*\s+)?["«]?([^"»?.!]+)/iu.test(query)) {
    const tail = query.match(/статус\s+(?:у\s+)?(?:клиент[а-я]*\s+)?["«]?([^"»?.!]+)/iu)?.[1]?.trim();
    if (tail && tail.length >= 3) intent.status = tail;
  }

  if (/хорват/i.test(lower)) {
    intent.country = "Хорватия";
    intent.direction = "Хорватия";
  }

  const cityMatch = query.match(
    /(?:адрес[а]?\s+)?(?:в|во)\s+(загреб|сплит|риек|осиек|zagreb|split|rijeka)/iu,
  );
  if (cityMatch?.[1]) {
    intent.city = cityMatch[1];
  }

  if (/куратор/i.test(lower)) {
    intent.notesContains = "куратор";
    intent.recentActivity = /недавн/i.test(lower);
  }

  if (/девушк|женщин/i.test(lower)) {
    intent.gender = "female";
  }
  if (/парн[ья]|мужчин/i.test(lower)) {
    intent.gender = "male";
  }

  const monthsInQuery = extractAllMonthsFromQuery(query);
  const yearInQuery = extractYearFromQuery(query);
  if (yearInQuery) {
    intent.submittedYear = yearInQuery;
    intent.bookingYear = yearInQuery;
  }

  if (monthsInQuery.length > 0) {
    if (isSubmissionDateQuery(query)) {
      intent.submittedMonths = monthsInQuery;
      intent.isListQuery = true;
    } else if (isBookingDateQuery(query)) {
      intent.bookingMonth = monthsInQuery[0] ?? null;
    } else if (isClientListQuery(query) || /заявк|клиент/i.test(lower)) {
      intent.submittedMonths = monthsInQuery;
      intent.isListQuery = true;
    }
  }

  if (isBookingDateQuery(query)) {
    for (const { pattern, month } of MONTH_PATTERNS_LEGACY) {
      if (pattern.test(lower)) {
        intent.bookingMonth = month;
        break;
      }
    }
  }

  if (/недавн/i.test(lower) && /отправ|запрос|писал/i.test(lower)) {
    intent.recentActivity = true;
  }

  if (/в\s+работе|находится\s+в\s+работе/i.test(lower)) {
    intent.status = intent.status ?? "в работе";
  }

  intent.isListQuery = intent.isListQuery || isClientListQuery(query);

  if (intent.isListQuery) {
    intent.clientName = null;
  } else {
    const entity = extractClientEntityFromQuery(query);
    if (entity?.searchPhrase) {
      intent.clientName = entity.searchPhrase;
    }
  }

  return intent;
}

/** Списочный запрос — нужен список клиентов, а не лучший одиночный match. */
export function isClientListQuery(query: string): boolean {
  const lower = query.toLowerCase();
  return (
    /у\s+кого/i.test(lower) ||
    /покажи\s+(?:всех\s+)?клиент/i.test(lower) ||
    /найди\s+(?:всех\s+)?клиент/i.test(lower) ||
    /список\s+клиент/i.test(lower) ||
    /клиент[а-яё]*\s+(?:менеджер[а]?|референт[а]?|referent)/i.test(lower) ||
    /клиент[а-яё]*\s+по\s+/i.test(lower) ||
    /кто\s+находится/i.test(lower) ||
    /(?:все|всех)\s+клиент/i.test(lower) ||
    (/подавал|подали|подач|заявк/i.test(lower) &&
      extractAllMonthsFromQuery(query).length > 0)
  );
}

export function resolveClientSearchIntentType(
  intent: ClientSearchIntent,
  query: string,
): ClientSearchIntentType {
  return intent.isListQuery || isClientListQuery(query) ? "list" : "single";
}

function mergeIntents(
  rules: ClientSearchIntent,
  ai: ClientSearchIntent,
  query: string,
): ClientSearchIntent {
  const isList =
    ai.isListQuery || rules.isListQuery || isClientListQuery(query);

  return {
    clientName: isList ? null : ai.clientName ?? rules.clientName,
    country: ai.country ?? rules.country,
    direction: ai.direction ?? rules.direction,
    manager: ai.manager ?? rules.manager,
    status: ai.status ?? rules.status,
    address: ai.address ?? rules.address,
    city: ai.city ?? rules.city,
    passport: ai.passport ?? rules.passport,
    email: ai.email ?? rules.email,
    phone: ai.phone ?? rules.phone,
    notesContains: ai.notesContains ?? rules.notesContains,
    gender: ai.gender ?? rules.gender,
    bookingMonth: ai.bookingMonth ?? rules.bookingMonth,
    bookingYear: ai.bookingYear ?? rules.bookingYear,
    submittedMonths:
      ai.submittedMonths.length > 0 ? ai.submittedMonths : rules.submittedMonths,
    submittedYear: ai.submittedYear ?? rules.submittedYear,
    recentActivity: ai.recentActivity || rules.recentActivity,
    freeText:
      ai.freeText.length > 0
        ? ai.freeText
        : rules.freeText,
    isListQuery: isList,
  };
}

export function hasStructuredSearchFilters(intent: ClientSearchIntent): boolean {
  return Boolean(
    intent.clientName ||
      intent.country ||
      intent.direction ||
      intent.manager ||
      intent.status ||
      intent.address ||
      intent.city ||
      intent.passport ||
      intent.email ||
      intent.phone ||
      intent.notesContains ||
      intent.gender ||
      intent.bookingMonth ||
      intent.submittedMonths.length > 0 ||
      intent.freeText.length > 0 ||
      intent.isListQuery,
  );
}

export async function analyzeClientSearchIntent(
  query: string,
): Promise<ClientSearchIntent> {
  const rules = parseClientSearchIntentRules(query);

  if (!isAiConfigured()) {
    return rules;
  }

  try {
    const ai = await extractClientSearchIntentWithAi(query);
    if (!ai) return rules;
    return mergeIntents(rules, ai, query);
  } catch (error) {
    console.error("[client-search-intent] AI extraction failed", error);
    return rules;
  }
}

export function formatClientSearchIntentForAi(
  intent: ClientSearchIntent,
): string {
  const parts: string[] = [];
  const push = (label: string, value: string | number | boolean | null | undefined) => {
    if (value === null || value === undefined || value === false || value === "") return;
    parts.push(`- ${label}: ${value}`);
  };

  push("имя клиента", intent.clientName);
  push("страна", intent.country);
  push("направление", intent.direction);
  push("менеджер", intent.manager);
  push("статус", intent.status);
  push("адрес", intent.address);
  push("город", intent.city);
  push("паспорт", intent.passport);
  push("email", intent.email);
  push("телефон", intent.phone);
  push("заметки содержат", intent.notesContains);
  push("пол", intent.gender);
  if (intent.bookingMonth) {
    push(
      "букинг заканчивается",
      intent.bookingYear
        ? `${intent.bookingMonth}/${intent.bookingYear}`
        : `месяц ${intent.bookingMonth}`,
    );
  }
  if (intent.submittedMonths.length > 0) {
    push(
      "дата подачи заявки",
      intent.submittedYear
        ? `${formatMonthsForIntent(intent.submittedMonths)} ${intent.submittedYear}`
        : formatMonthsForIntent(intent.submittedMonths),
    );
  }
  push("недавняя активность", intent.recentActivity ? "да" : null);
  push("список клиентов", intent.isListQuery ? "да" : null);
  if (intent.freeText.length > 0) {
    parts.push(`- свободный текст: ${intent.freeText.join(", ")}`);
  }

  const intentType = intent.isListQuery ? "list" : "single";
  parts.unshift(`- тип запроса: ${intentType}`);

  if (parts.length === 1) {
    return "Фильтры не извлечены — поиск по общему смыслу запроса.";
  }

  return `Распознанные критерии поиска:\n${parts.join("\n")}`;
}

export function isClientContextualQuery(query: string): boolean {
  const lower = query.toLowerCase();
  return (
    /\b\d{6,12}\b/.test(query) ||
    /у\s+кого|покажи\s+клиент|найди\s+клиент|клиентов\s+менеджер|список\s+клиент/i.test(
      lower,
    ) ||
    /менеджер|статус|паспорт|букинг|адрес|хорват|загреб|куратор|девушк|недавн|подач|заявк|январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр/i.test(
      lower,
    )
  );
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

export function textMatchesField(haystack: string, needle: string): boolean {
  const hay = normalizeComparable(stripDiacritics(haystack));
  const ned = normalizeComparable(stripDiacritics(needle));
  if (!hay || !ned) return false;
  if (hay.includes(ned)) return true;

  const nedParts = ned.match(/[a-z0-9]{2,}/g) ?? [];
  if (nedParts.length > 1) {
    return nedParts.every((part) => hay.includes(part));
  }
  return false;
}
