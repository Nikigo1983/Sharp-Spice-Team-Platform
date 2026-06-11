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
  recentActivity: boolean;
  freeText: string[];
  isListQuery: boolean;
};

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
  recentActivity: false,
  freeText: [],
  isListQuery: false,
};

const MONTH_PATTERNS: Array<{ pattern: RegExp; month: number }> = [
  { pattern: /январ/i, month: 1 },
  { pattern: /феврал/i, month: 2 },
  { pattern: /март/i, month: 3 },
  { pattern: /апрел/i, month: 4 },
  { pattern: /ма[йя]/i, month: 5 },
  { pattern: /июн/i, month: 6 },
  { pattern: /июл/i, month: 7 },
  { pattern: /август/i, month: 8 },
  { pattern: /сентябр/i, month: 9 },
  { pattern: /октябр/i, month: 10 },
  { pattern: /ноябр/i, month: 11 },
  { pattern: /декабр/i, month: 12 },
];

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
  "recentActivity": boolean,
  "freeText": string[],
  "isListQuery": boolean
}

Rules:
- "у кого", "покажи клиентов", "найди клиентов" → isListQuery: true
- "девушку", "женщину" → gender: "female"
- "недавно" in activity context → recentActivity: true
- Extract passport as digits only
- bookingMonth: 1-12 for phrases like "в июне", "заканчивается в июне"
- notesContains: key phrases like "куратор", "запрос куратору"
- country/direction: e.g. "Хорватия", "Croatia"
- city: e.g. "Загреб", "Zagreb" — also set address if query mentions address in city`;

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

  const entity = extractClientEntityFromQuery(query);
  if (entity?.searchPhrase) {
    intent.clientName = entity.searchPhrase;
  }

  const email = extractEmailFromQuery(query);
  if (email) intent.email = email;

  const phone = extractPhoneFromQuery(query);
  if (phone) intent.phone = phone;

  const passportMatch = query.match(/\b(\d{6,12})\b/);
  if (passportMatch?.[1]) intent.passport = passportMatch[1];

  const managerMatch = query.match(
    /(?:менеджер[а]?|manager)\s+([a-zа-яё\sšžćčđŠŽĆČĐ\-'.]+)/iu,
  );
  if (managerMatch?.[1]) intent.manager = managerMatch[1].trim();

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

  if (/букинг|booking/i.test(lower)) {
    for (const { pattern, month } of MONTH_PATTERNS) {
      if (pattern.test(lower)) {
        intent.bookingMonth = month;
        break;
      }
    }
    const yearMatch = lower.match(/\b(20\d{2})\b/);
    if (yearMatch?.[1]) intent.bookingYear = Number(yearMatch[1]);
  }

  if (/недавн/i.test(lower) && /отправ|запрос|писал/i.test(lower)) {
    intent.recentActivity = true;
  }

  intent.isListQuery =
    /у\s+кого|покажи\s+клиент|найди\s+клиент|клиентов\s+менеджер|список\s+клиент/i.test(
      lower,
    );

  return intent;
}

function mergeIntents(
  rules: ClientSearchIntent,
  ai: ClientSearchIntent,
): ClientSearchIntent {
  return {
    clientName: ai.clientName ?? rules.clientName,
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
    recentActivity: ai.recentActivity || rules.recentActivity,
    freeText:
      ai.freeText.length > 0
        ? ai.freeText
        : rules.freeText,
    isListQuery: ai.isListQuery || rules.isListQuery,
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
    return mergeIntents(rules, ai);
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
  push("недавняя активность", intent.recentActivity ? "да" : null);
  push("список клиентов", intent.isListQuery ? "да" : null);
  if (intent.freeText.length > 0) {
    parts.push(`- свободный текст: ${intent.freeText.join(", ")}`);
  }

  if (parts.length === 0) {
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
    /менеджер|статус|паспорт|букинг|адрес|хорват|загреб|куратор|девушк|недавн/i.test(
      lower,
    )
  );
}

export function textMatchesField(haystack: string, needle: string): boolean {
  const hay = normalizeComparable(haystack);
  const ned = normalizeComparable(needle);
  if (!hay || !ned) return false;
  if (hay.includes(ned)) return true;

  const hayWords = hay.split(/\s+/).filter(Boolean);
  const nedWords = ned.split(/\s+/).filter(Boolean);
  if (nedWords.length > 1) {
    return nedWords.every((word) => hayWords.some((hw) => hw.includes(word) || word.includes(hw)));
  }
  return false;
}
