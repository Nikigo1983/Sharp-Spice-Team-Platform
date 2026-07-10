import "server-only";

import {
  crmClientToContext,
  formgridRowToContext,
  type ClientContext,
  type ResolvedClientContext,
} from "@/lib/ai/client-context";
import { deduplicateToResolved } from "@/lib/ai/client-deduplication";
import {
  type ClientSearchIntent,
  textMatchesField,
} from "@/lib/ai/client-search-intent";
import {
  bookingEndsInMonth,
  dateInMonths,
  parseDateParts,
} from "@/lib/ai/client-date-parse";
import {
  buildClientSearchQuery,
  buildNormalizedNameFields,
  normalizePhone,
  scoreClientRecord,
  SCORE_VIABLE,
  type SearchField,
} from "@/lib/ai/client-search";
import { getFormgridLeadsTable } from "@/lib/google-sheets/formgrid-leads";
import { listAllClients } from "@/lib/google-sheets/service";
import type { Client } from "@/lib/google-sheets/types";

const STRUCTURED_MIN_SCORE = 35;

function isEmptyField(value: string | undefined): boolean {
  return !value || value === "—";
}

function pushField(
  fields: SearchField[],
  label: string,
  value: string | undefined,
  category: SearchField["category"],
): void {
  if (isEmptyField(value)) return;
  fields.push({ label, value: value!.trim(), category });
}

function appendNormalizedNameFields(
  fields: SearchField[],
  ...names: Array<string | undefined>
): void {
  for (const name of names) {
    if (!name || name === "—") continue;
    fields.push(...buildNormalizedNameFields(name));
  }
}

function crmClientToSearchFields(client: Client): SearchField[] {
  const fields: SearchField[] = [];
  pushField(fields, "ФИО / фамилия", client.name, "name");
  appendNormalizedNameFields(fields, client.name);
  if (client.citizenship && client.citizenship !== "—") {
    pushField(fields, "латиница", client.citizenship, "name");
    pushField(fields, "ФИО (латиница)", client.citizenship, "name");
    appendNormalizedNameFields(fields, client.citizenship);
  }
  pushField(fields, "партнер от кого клиент", client.partnerName, "other");
  pushField(fields, "договор", client.contract, "other");
  pushField(fields, "телефон", client.phone, "phone");
  pushField(fields, "email", client.email, "email");
  pushField(fields, "паспорт", client.passportNumber, "other");
  pushField(fields, "менеджер", client.manager, "other");
  pushField(fields, "референт", client.referentName, "other");
  pushField(fields, "заметки", client.notes, "notes");
  pushField(fields, "адрес букинга", client.bookingAddress, "other");
  pushField(fields, "даты букинга", client.bookingRange, "other");
  pushField(fields, "дата подачи", client.submittedAt, "date");
  pushField(fields, "дата подачи заявки", client.submittedAt, "date");
  pushField(fields, "предполагаемое одобрение", client.expectedApprovalAt, "date");
  pushField(fields, "дата одобрения", client.approvalAt, "date");
  pushField(
    fields,
    "дата выдачи карточки",
    client.residenceCardIssuedAt,
    "other",
  );
  pushField(fields, "последняя активность", client.lastActivity, "other");
  pushField(fields, "страна", client.country, "other");
  pushField(fields, "направление", client.direction, "other");
  pushField(fields, "статус", client.status, "other");
  return fields;
}

function formgridRowToSearchFields(headers: string[], row: string[]): SearchField[] {
  const fields: SearchField[] = [];
  const nameValues: string[] = [];

  headers.forEach((header, index) => {
    const value = (row[index] ?? "").trim();
    if (!header || !value) return;

    let category: SearchField["category"] = "other";
    if (/фио|name|имя|фамил|surname|first|last/i.test(header)) {
      category = "name";
      nameValues.push(value);
    } else if (/телефон|phone|whatsapp|telegram|тел\./i.test(header)) {
      category = "phone";
    } else if (/email|почта|e-mail|электронн|mail/i.test(header)) {
      category = "email";
    } else if (/коммент|замет|note|comment/i.test(header)) {
      category = "notes";
    } else if (/дата|date|подач|одобр/i.test(header)) {
      category = "date";
    }

    fields.push({ label: header, value, category });
  });

  appendNormalizedNameFields(fields, ...nameValues);
  return fields;
}

function fieldValueByLabel(fields: SearchField[], pattern: RegExp): string {
  return fields
    .filter((field) => pattern.test(field.label))
    .map((field) => field.value)
    .join(" ");
}

function looksFemaleName(name: string): boolean {
  const token = name.trim().split(/\s+/).pop() ?? "";
  return /[аяия]$/iu.test(token);
}

function looksMaleName(name: string): boolean {
  const token = name.trim().split(/\s+/).pop() ?? "";
  return /[ийь]$/iu.test(token) && !/[аяия]$/iu.test(token);
}

function scoreRecordAgainstIntent(
  fields: SearchField[],
  intent: ClientSearchIntent,
  client?: Client,
): { score: number; matchedFields: string[]; passed: boolean } {
  const matchedFields: string[] = [];
  let score = 0;
  const required: boolean[] = [];

  const allText = fields.map((field) => field.value).join(" ");

  if (intent.passport) {
    const passportDigits = intent.passport.replace(/\D/g, "");
    const hit = fields.some((field) => {
      const digits = normalizePhone(field.value);
      return (
        digits.includes(passportDigits) ||
        field.value.replace(/\s/g, "").includes(passportDigits)
      );
    });
    required.push(hit);
    if (hit) {
      score += 100;
      matchedFields.push(`паспорт: ${intent.passport}`);
    }
  }

  if (intent.email) {
    const hit = fields.some(
      (field) =>
        field.category === "email" &&
        field.value.toLowerCase().includes(intent.email!.toLowerCase()),
    );
    required.push(hit);
    if (hit) {
      score += 95;
      matchedFields.push(`email: ${intent.email}`);
    }
  }

  if (intent.phone) {
    const hit = fields.some((field) => {
      if (field.category === "date") return false;
      const digits = normalizePhone(field.value);
      return digits.includes(intent.phone!) || intent.phone!.includes(digits.slice(-10));
    });
    required.push(hit);
    if (hit) {
      score += 95;
      matchedFields.push(`телефон: ${intent.phone}`);
    }
  }

  if (intent.manager) {
    const managerHay = fieldValueByLabel(fields, /менеджер|референт|manager/i);
    const hit = textMatchesField(managerHay, intent.manager) || textMatchesField(allText, intent.manager);
    required.push(hit);
    if (hit) {
      score += 70;
      matchedFields.push(`менеджер: ${intent.manager}`);
    }
  }

  if (intent.partnerName) {
    const partnerHay =
      client?.partnerName ??
      fieldValueByLabel(fields, /партнер/i);
    const hit =
      textMatchesField(partnerHay, intent.partnerName) ||
      textMatchesField(allText, intent.partnerName);
    required.push(hit);
    if (hit) {
      score += 75;
      matchedFields.push(`партнер: ${intent.partnerName}`);
    }
  }

  if (intent.status) {
    const statusHay = `${fieldValueByLabel(fields, /статус/i)} ${fieldValueByLabel(fields, /замет/i)}`;
    const hit =
      textMatchesField(statusHay, intent.status) ||
      textMatchesField(allText, intent.status);
    required.push(hit);
    if (hit) {
      score += 65;
      matchedFields.push(`статус: ${intent.status}`);
    }
  }

  if (intent.country) {
    const countryHay = fieldValueByLabel(fields, /страна|направлен/i);
    const hit =
      textMatchesField(countryHay, intent.country) ||
      textMatchesField(allText, intent.country);
    required.push(hit);
    if (hit) {
      score += 55;
      matchedFields.push(`страна: ${intent.country}`);
    }
  }

  if (intent.direction) {
    const directionHay = fieldValueByLabel(fields, /направлен/i);
    const hit =
      textMatchesField(directionHay, intent.direction) ||
      textMatchesField(allText, intent.direction);
    required.push(hit);
    if (hit) {
      score += 50;
      matchedFields.push(`направление: ${intent.direction}`);
    }
  }

  const locationNeedle = intent.city ?? intent.address;
  if (locationNeedle) {
    const addressHay = fieldValueByLabel(fields, /адрес|address|букинг|город|city/i);
    const hit =
      textMatchesField(addressHay, locationNeedle) ||
      textMatchesField(allText, locationNeedle);
    required.push(hit);
    if (hit) {
      score += 60;
      matchedFields.push(`адрес/город: ${locationNeedle}`);
    }
  }

  if (intent.notesContains) {
    const notesHay = fieldValueByLabel(fields, /замет|коммент|note/i);
    const hit =
      textMatchesField(notesHay, intent.notesContains) ||
      textMatchesField(allText, intent.notesContains);
    required.push(hit);
    if (hit) {
      score += 55;
      matchedFields.push(`заметки: ${intent.notesContains}`);
    }
  }

  if (intent.bookingMonth) {
    const bookingHay =
      client?.bookingRange ?? fieldValueByLabel(fields, /букинг|booking|дат/i);
    const hit = bookingHay
      ? bookingEndsInMonth(bookingHay, intent.bookingMonth, intent.bookingYear)
      : false;
    required.push(hit);
    if (hit) {
      score += 60;
      matchedFields.push(
        `букинг до: ${intent.bookingMonth}${intent.bookingYear ? `/${intent.bookingYear}` : ""}`,
      );
    }
  }

  if (intent.submittedMonths.length > 0) {
    const submittedHay =
      client?.submittedAt ??
      fieldValueByLabel(fields, /дата подачи|submission|подач/i);
    const hit = submittedHay
      ? dateInMonths(submittedHay, intent.submittedMonths, intent.submittedYear)
      : false;
    required.push(hit);
    if (hit) {
      score += 70;
      matchedFields.push(
        `дата подачи: ${intent.submittedMonths.join(",")}${intent.submittedYear ? `/${intent.submittedYear}` : ""}`,
      );
    }
  }

  if (intent.clientName) {
    const nameScore = scoreClientRecord(
      buildClientSearchQuery(intent.clientName),
      fields,
    );
    const hit = nameScore.score >= SCORE_VIABLE;
    required.push(hit);
    if (hit) {
      score += nameScore.score;
      matchedFields.push(...nameScore.matchedFields);
    }
  }

  if (intent.gender === "female") {
    const name = fieldValueByLabel(fields, /фио|имя|name|фамил/i) || allText;
    const hit = looksFemaleName(name);
    required.push(hit);
    if (hit) {
      score += 25;
      matchedFields.push("пол: женский (эвристика по имени)");
    }
  }

  if (intent.gender === "male") {
    const name = fieldValueByLabel(fields, /фио|имя|name|фамил/i) || allText;
    const hit = looksMaleName(name);
    required.push(hit);
    if (hit) {
      score += 25;
      matchedFields.push("пол: мужской (эвристика по имени)");
    }
  }

  if (intent.freeText.length > 0) {
    const hit = intent.freeText.every((token) => textMatchesField(allText, token));
    required.push(hit);
    if (hit) {
      score += 30;
      matchedFields.push(`текст: ${intent.freeText.join(", ")}`);
    }
  }

  const activeFilters = required.length > 0;
  const passed = !activeFilters || required.every(Boolean);

  if (!passed) {
    return { score: 0, matchedFields: [], passed: false };
  }

  if (score === 0 && intent.isListQuery) {
    score = STRUCTURED_MIN_SCORE;
    matchedFields.push("список по запросу");
  }

  return {
    score: Math.max(score, passed && score > 0 ? STRUCTURED_MIN_SCORE : 0),
    matchedFields: [...new Set(matchedFields)],
    passed,
  };
}

function activitySortKey(client: ClientContext): number {
  const raw = client.lastActivity || client.surveyData.slice(0, 40);
  const parsed = parseDateParts(raw);
  if (parsed) {
    return new Date(parsed.year, parsed.month - 1, parsed.day).getTime();
  }
  return 0;
}

export type StructuredClientSearchResult = {
  clients: ResolvedClientContext[];
  totalFound: number;
};

export async function executeStructuredClientSearch(
  intent: ClientSearchIntent,
  fallbackQuery: string,
  limit = 10,
): Promise<StructuredClientSearchResult> {
  const effectiveIntent: ClientSearchIntent = {
    ...intent,
    clientName: intent.isListQuery
      ? intent.clientName
      : intent.clientName ?? extractNameFromFallback(fallbackQuery),
  };

  const matches: ClientContext[] = [];

  const { items: crmClients } = await listAllClients();
  for (const client of crmClients) {
    const fields = crmClientToSearchFields(client);
    const { score, matchedFields, passed } = scoreRecordAgainstIntent(
      fields,
      effectiveIntent,
      client,
    );
    if (passed && score >= STRUCTURED_MIN_SCORE) {
      matches.push(crmClientToContext(client, score, matchedFields));
    }
  }

  const formgrid = await getFormgridLeadsTable();
  formgrid.rows.forEach((row, index) => {
    const fields = formgridRowToSearchFields(formgrid.headers, row);
    const { score, matchedFields, passed } = scoreRecordAgainstIntent(
      fields,
      effectiveIntent,
    );
    if (passed && score >= STRUCTURED_MIN_SCORE) {
      matches.push(
        formgridRowToContext(formgrid.headers, row, index, score, matchedFields),
      );
    }
  });

  const sorted = matches.sort((a, b) => {
    if (effectiveIntent.recentActivity) {
      return activitySortKey(b) - activitySortKey(a);
    }
    return b.score - a.score;
  });

  const deduped = deduplicateToResolved(sorted);
  return {
    clients: deduped.slice(0, limit),
    totalFound: deduped.length,
  };
}

/** Для тестов и диагностики: проходит ли CRM-клиент по intent-фильтрам. */
export function crmClientMatchesSearchIntent(
  client: Client,
  intent: ClientSearchIntent,
): boolean {
  const fields = crmClientToSearchFields(client);
  const { passed, score } = scoreRecordAgainstIntent(fields, intent, client);
  return passed && score >= STRUCTURED_MIN_SCORE;
}

function extractNameFromFallback(query: string): string | null {
  const entity = buildClientSearchQuery(query);
  if (entity.tokens.length === 0) return null;
  return entity.fullNamePhrase || entity.tokens.join(" ");
}
