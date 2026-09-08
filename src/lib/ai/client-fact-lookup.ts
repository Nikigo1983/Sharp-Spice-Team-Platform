/**
 * Deterministic structured client-field answers (CRM table facts).
 * Prefer exact stored values over LLM inference for simple field questions.
 */

import type { ClientContext, ResolvedClientContext } from "@/lib/ai/client-context";
import { isMergedClientContext } from "@/lib/ai/client-context";
import { morphNameMatch } from "@/lib/ai/russian-name-morphology";
import type { Client } from "@/lib/google-sheets/types";

export type ClientFactFieldId =
  | "bookingAddress"
  | "bookingRange"
  | "passport"
  | "email"
  | "submittedAt"
  | "status"
  | "notes"
  | "approvalAt"
  | "partner"
  | "latinName";

type FactSpec = {
  id: ClientFactFieldId;
  label: string;
  aliases: RegExp;
  debugKeys: string[];
  clientKeys: Array<keyof Client>;
  sensitive?: boolean;
};

const FACT_SPECS: FactSpec[] = [
  {
    id: "bookingAddress",
    label: "Адрес букинга",
    aliases:
      /адрес\s+букинг|букинг.{0,20}адрес|booking\s+address|адрес\s+бронир|address\s+of\s+booking/i,
    debugKeys: ["bookingAddress", "адрес букинга"],
    clientKeys: ["bookingAddress"],
  },
  {
    id: "bookingRange",
    label: "Дата букинга",
    aliases:
      /дат[аы]\s+букинг|booking\s+dates?|даты?\s+бронир|когда\s+букинг|период\s+букинг/i,
    debugKeys: ["bookingRange", "даты букинга", "дата букинга"],
    clientKeys: ["bookingRange"],
  },
  {
    id: "passport",
    label: "Номер паспорта",
    aliases: /паспорт|passport/i,
    debugKeys: ["passport", "паспорт"],
    clientKeys: ["passportNumber"],
  },
  {
    id: "email",
    label: "Email",
    aliases: /e-?mail|электронн\w*\s+почт|почт[аыеу]/i,
    debugKeys: ["email"],
    clientKeys: ["email"],
  },
  {
    id: "submittedAt",
    label: "Дата подачи",
    aliases: /дата\s+подачи|application\s+date|submitted/i,
    debugKeys: ["submittedAt", "дата подачи"],
    clientKeys: ["submittedAt", "createdAt"],
  },
  {
    id: "status",
    label: "Статус",
    aliases: /(?<!\p{L})статус(?!\p{L})|(?<!\p{L})status(?!\p{L})/iu,
    debugKeys: ["statusForAi", "status"],
    clientKeys: ["status"],
  },
  {
    id: "notes",
    label: "Заметки",
    aliases: /заметк|notes?/i,
    debugKeys: ["notes", "заметки"],
    clientKeys: ["notes"],
  },
  {
    id: "approvalAt",
    label: "Дата одобрения ВНЖ",
    aliases: /дата\s+одобрения|approval\s+date/i,
    debugKeys: ["approvalAt", "дата одобрения"],
    clientKeys: ["approvalAt"],
  },
  {
    id: "partner",
    label: "Партнер от кого клиент",
    aliases: /партн[её]р|partner/i,
    debugKeys: ["partner", "партнер"],
    clientKeys: ["partnerName"],
  },
  {
    id: "latinName",
    label: "Латиница",
    aliases: /латиниц|latin\s+name|translit/i,
    debugKeys: ["latinName", "латиница"],
    clientKeys: ["citizenship"],
  },
];

/** Fields that must never be answered via generic structured lookup. */
export const BLOCKED_CLIENT_FACT_KEYS = new Set([
  "appPassword",
  "password",
  "пароль",
  "пароль для приложения",
]);

export function detectRequestedClientFactField(
  query: string,
): ClientFactFieldId | null {
  const lower = query.toLowerCase();
  if (/парол|password|app\s*password|секрет|token|api[_-]?key/i.test(lower)) {
    return null;
  }
  for (const spec of FACT_SPECS) {
    if (spec.aliases.test(query) || spec.aliases.test(lower)) {
      return spec.id;
    }
  }
  return null;
}

function displayValue(value: string | undefined | null): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "—") return "";
  return trimmed;
}

function specById(id: ClientFactFieldId): FactSpec {
  const spec = FACT_SPECS.find((entry) => entry.id === id);
  if (!spec) throw new Error(`Unknown client fact field: ${id}`);
  return spec;
}

export function readClientFactFromCrmContext(
  client: ClientContext,
  fieldId: ClientFactFieldId,
): { value: string; present: boolean } {
  const spec = specById(fieldId);
  for (const key of spec.debugKeys) {
    if (BLOCKED_CLIENT_FACT_KEYS.has(key.toLowerCase())) {
      return { value: "", present: false };
    }
    const fromDebug = displayValue(client.debugRow?.[key]);
    if (fromDebug) return { value: fromDebug, present: true };
  }
  if (fieldId === "email") {
    const email = displayValue(client.email);
    if (email) return { value: email, present: true };
  }
  if (fieldId === "status") {
    const status = displayValue(client.status);
    if (status) return { value: status, present: true };
  }
  return { value: "", present: false };
}

export function readClientFactFromClientRecord(
  client: Client,
  fieldId: ClientFactFieldId,
): { value: string; present: boolean } {
  const spec = specById(fieldId);
  for (const key of spec.clientKeys) {
    if (BLOCKED_CLIENT_FACT_KEYS.has(String(key).toLowerCase())) {
      continue;
    }
    const value = displayValue(client[key] as string | undefined);
    if (value) return { value, present: true };
  }
  return { value: "", present: false };
}

export function crmPartFromResolved(
  resolved: ResolvedClientContext,
): ClientContext | null {
  if (isMergedClientContext(resolved)) {
    return resolved.parts.find((part) => part.source === "clients") ?? null;
  }
  return resolved.source === "clients" ? resolved : null;
}

export function formatStructuredClientFactReply(params: {
  clientName: string;
  fieldId: ClientFactFieldId;
  value: string;
  present: boolean;
  rowIndex?: number;
}): string {
  const spec = specById(params.fieldId);
  const row =
    params.rowIndex && params.rowIndex > 0
      ? ` · строка ${params.rowIndex}`
      : "";
  if (!params.present) {
    return `У **${params.clientName}** в таблице «Клиенты» поле «${spec.label}» пустое (не заполнено)${row}.`;
  }
  return `**${params.value}** — ${spec.label.toLowerCase()} **${params.clientName}** · таблица «Клиенты»${row}`;
}

/** Match CRM surname/name against a query token (supports RU case endings). */
export function clientNameMatchesQueryToken(
  clientName: string,
  token: string,
): boolean {
  const needle = token.trim().toLowerCase();
  if (needle.length < 3) return false;
  const name = clientName.toLowerCase();
  if (name.includes(needle) || needle.includes(name.split(/\s+/)[0] ?? "")) {
    return true;
  }
  return name
    .split(/[^\p{L}\p{N}\-]+/u)
    .filter(Boolean)
    .some((part) => morphNameMatch(needle, part) || morphNameMatch(part, needle));
}

export function extractClientNameHintFromFactQuery(query: string): string | null {
  const afterClient = query.match(
    /клиент[а-яё]*\s+([А-ЯЁA-Za-zа-яё\-']{3,})/iu,
  );
  if (afterClient?.[1]) return afterClient[1];

  const afterU = query.match(
    /(?<!\p{L})у\s+([А-ЯЁA-Za-zа-яё\-']{3,})/iu,
  );
  if (afterU?.[1] && !/^клиент/i.test(afterU[1])) return afterU[1];

  const afterField = query.match(
    /(?:адрес\s+букинга|booking\s+address|дат[аы]\s+букинга|паспорт|email|почта|статус|латиниц[аы]|заметк[аи])\s+([А-ЯЁA-Z][а-яёa-z\-']{3,})/u,
  );
  if (afterField?.[1]) return afterField[1];

  const beforeField = query.match(
    /([А-ЯЁA-Z][а-яёa-z\-']{3,})\s+(?:адрес\s+букинга|booking\s+address|букинг)/u,
  );
  if (beforeField?.[1]) return beforeField[1];

  return null;
}
