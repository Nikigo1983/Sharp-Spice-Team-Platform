import {
  formatNormalizedQueryLabel,
  type NormalizedNameParts,
} from "@/lib/ai/russian-name-morphology";
import {
  formatFormgridRowDetailed,
  getFormgridClientFields,
} from "@/lib/google-sheets/formgrid-lookup";
import {
  FORMGRID_LEAD_STATUS,
  formatStatusForAiContext,
  logClientStatusDebug,
  sanitizeCrmClientStatus,
} from "@/lib/ai/client-status";
import type { Client } from "@/lib/google-sheets/types";

export type ClientDebugScanHit = {
  source: string;
  rowIndex: number;
  column: string;
  value: string;
  matchedToken: string;
};

export type ClientContextSource = "clients" | "new_clients" | "merged";

export type ClientContext = {
  source: "clients" | "new_clients";
  sourceLabel: string;
  rowIndex: number;
  name: string;
  phone: string;
  email: string;
  country: string;
  direction: string;
  status: string;
  manager: string;
  lastActivity: string;
  surveyData: string;
  score: number;
  matchedFields: string[];
  debugRow: Record<string, string>;
};

export type MergedClientContext = {
  source: "merged";
  sourceLabel: "Объединённый";
  rowIndex: number;
  name: string;
  phone: string;
  email: string;
  country: string;
  direction: string;
  status: string;
  manager: string;
  lastActivity: string;
  surveyData: string;
  crmData: string;
  score: number;
  matchedFields: string[];
  mergeReasons: string[];
  parts: ClientContext[];
  conflicts: Array<{
    field: string;
    values: Array<{ source: string; value: string }>;
  }>;
  debugRow: Record<string, string>;
};

export type ResolvedClientContext = ClientContext | MergedClientContext;

export function isMergedClientContext(
  client: ResolvedClientContext,
): client is MergedClientContext {
  return client.source === "merged";
}

export function crmClientToContext(
  client: Client,
  score: number,
  matchedFields: string[] = [],
): ClientContext {
  const surveyParts = [
    client.passportNumber && client.passportNumber !== "—"
      ? `Паспорт: ${client.passportNumber}`
      : "",
    client.bookingAddress && client.bookingAddress !== "—"
      ? `Адрес букинга: ${client.bookingAddress}`
      : "",
    client.bookingRange && client.bookingRange !== "—"
      ? `Даты букинга: ${client.bookingRange}`
      : "",
    client.notes && client.notes !== "—"
      ? `Заметки: ${client.notes.slice(0, 500)}`
      : "",
  ].filter(Boolean);

  const rawStatus = sanitizeCrmClientStatus(client.status);
  const finalStatus = formatStatusForAiContext(rawStatus, "clients");

  logClientStatusDebug({
    name: client.name,
    source: "Клиенты",
    rawStatus,
    finalStatus,
  });

  return {
    source: "clients",
    sourceLabel: "Клиенты",
    rowIndex: client.rowIndex ?? 0,
    name: client.name,
    phone: client.phone !== "—" ? client.phone : "",
    email: client.email !== "—" ? client.email : "",
    country: client.country !== "—" ? client.country : "",
    direction: client.direction !== "—" ? client.direction : "",
    status: finalStatus,
    manager: client.manager !== "—" ? client.manager : "",
    lastActivity: client.lastActivity !== "—" ? client.lastActivity : "",
    surveyData: surveyParts.join("\n"),
    score,
    matchedFields,
    debugRow: {
      id: client.id,
      name: client.name,
      passport: client.passportNumber ?? "",
      manager: client.manager ?? "",
      status: rawStatus,
      statusForAi: finalStatus,
      bookingAddress: client.bookingAddress ?? "",
      bookingRange: client.bookingRange ?? "",
    },
  };
}

export function formgridRowToContext(
  headers: string[],
  row: string[],
  rowIndex: number,
  score: number,
  matchedFields: string[] = [],
): ClientContext {
  const fields = getFormgridClientFields(headers, row);
  const debugRow: Record<string, string> = {};
  headers.forEach((header, index) => {
    const value = (row[index] ?? "").trim();
    if (header && value) {
      debugRow[header.slice(0, 80)] = value.slice(0, 200);
    }
  });

  return {
    source: "new_clients",
    sourceLabel: "Новые клиенты",
    rowIndex: rowIndex + 2,
    name: fields.name,
    phone: fields.phone,
    email: fields.email,
    country: "",
    direction: "Хорватия",
    status: FORMGRID_LEAD_STATUS,
    manager: "",
    lastActivity: fields.submittedAt,
    surveyData: formatFormgridRowDetailed(headers, row),
    score,
    matchedFields,
    debugRow,
  };
}

export type ClientCandidateScenario =
  | "multiple"
  | "weak"
  | "not_found"
  | "structured";

export function formatClientCandidatesForAi(
  clients: ResolvedClientContext[],
  scenario: ClientCandidateScenario = "multiple",
  totalFound?: number,
): string {
  const total = totalFound ?? clients.length;
  const intro =
    scenario === "not_found"
      ? "Точного совпадения в таблицах нет. Ближайшие кандидаты (fuzzy-поиск):"
      : scenario === "weak"
        ? "Точных совпадений нет. Похожие записи:"
        : scenario === "structured"
          ? `Результаты структурированного поиска (найдено ${total}, передано в контекст ${clients.length}):`
          : "Найдено несколько подходящих клиентов:";

  const countNote =
    scenario === "structured" && total > clients.length
      ? `\n\nВ контекст переданы первые ${clients.length} из ${total} найденных.`
      : "";

  const lines = clients.map((client, index) => {
    const mergedNote =
      isMergedClientContext(client) && client.parts.length > 1
        ? ` (объединено: ${client.parts.map((p) => p.sourceLabel).join(" + ")})`
        : "";
    const details = [
      `${index + 1}. **${client.name}** — ${client.sourceLabel}, строка ${client.rowIndex}${mergedNote}`,
      client.score ? `   релевантность: ${client.score}` : "",
      client.email ? `   email: ${client.email}` : "",
      client.phone ? `   телефон: ${client.phone}` : "",
      client.status ? `   статус: ${client.status}` : "",
      client.manager ? `   менеджер: ${client.manager}` : "",
      client.country ? `   страна: ${client.country}` : "",
      client.matchedFields.length > 0
        ? `   совпадения: ${client.matchedFields.slice(0, 4).join("; ")}`
        : "",
    ].filter(Boolean);
    return details.join("\n");
  });

  return `${intro}${countNote}\n\n${lines.join("\n\n")}`;
}

export function formatClientContextBlock(client: ResolvedClientContext): string {
  if (isMergedClientContext(client)) {
    return formatMergedClientContextBlock(client);
  }

  const lines = [
    `Источник: ${client.sourceLabel} (Google Sheets)`,
    `Строка таблицы: ${client.rowIndex}`,
    `Имя: ${client.name}`,
    client.phone ? `Телефон: ${client.phone}` : "",
    client.email ? `Email: ${client.email}` : "",
    client.country ? `Страна: ${client.country}` : "",
    client.direction ? `Направление: ${client.direction}` : "",
    client.status ? `Статус: ${client.status}` : "",
    client.manager ? `Ответственный менеджер: ${client.manager}` : "",
    client.lastActivity
      ? `Последняя активность: ${client.lastActivity}`
      : "",
    client.surveyData ? `Данные анкеты / таблицы:\n${client.surveyData}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

export function formatMergedClientContextBlock(
  merged: MergedClientContext,
): string {
  const sourceLines = merged.parts.map(
    (part) => `Источник ${merged.parts.indexOf(part) + 1}: ${part.sourceLabel}, строка ${part.rowIndex}`,
  );

  const contactLines = [
    merged.email ? `Email: ${merged.email}` : "",
    merged.phone ? `Телефон: ${merged.phone}` : "",
  ].filter(Boolean);

  const crmPart = merged.parts.find((part) => part.source === "clients");
  const formPart = merged.parts.find((part) => part.source === "new_clients");

  const lines = [
    "=== CLIENT CONTEXT (MERGED) ===",
    ...sourceLines,
    "",
    `ФИО: ${merged.name}`,
    contactLines.length > 0 ? `Контакты:\n${contactLines.join("\n")}` : "",
    merged.mergeReasons.length > 0
      ? `Объединено по: ${merged.mergeReasons.join(", ")}`
      : "",
  ].filter(Boolean);

  if (crmPart) {
    lines.push("", "Данные из CRM:", formatClientContextBlock(crmPart));
  } else if (merged.crmData) {
    lines.push("", "Данные из CRM:", merged.crmData);
  }

  if (formPart?.surveyData || merged.surveyData) {
    lines.push("", "Данные анкеты:", formPart?.surveyData ?? merged.surveyData);
  }

  if (merged.conflicts.length > 0) {
    lines.push("", "Конфликты данных:");
    for (const conflict of merged.conflicts) {
      lines.push(
        `${conflict.field}:`,
        ...conflict.values.map((entry) => `${entry.source}: ${entry.value}`),
      );
    }
  }

  return lines.join("\n");
}

export function formatMultipleClientsReply(
  clients: ResolvedClientContext[],
): string {
  const lines = clients.map((client, index) => {
    const parts =
      isMergedClientContext(client) && client.parts.length > 1
        ? ` (объединено: ${client.parts.map((p) => p.sourceLabel).join(" + ")})`
        : "";
    return (
      `${index + 1}. **${client.name}** — ${client.sourceLabel}${parts} — строка ${client.rowIndex}` +
      (client.score ? ` (score ${client.score})` : "") +
      (client.email ? `, ${client.email}` : "") +
      (client.phone ? `, ${client.phone}` : "")
    );
  });

  return [
    `Найдено несколько клиентов:`,
    ...lines,
    "",
    "Уточните, кого выбрать — или напишите **«объединить как одного клиента»**, **«выбери 1»**, **«это один и тот же клиент»**.",
  ].join("\n");
}

export function formatWeakMatchesReply(clients: ResolvedClientContext[]): string {
  const lines = clients.map(
    (client, index) =>
      `${index + 1}. **${client.name}** — ${client.sourceLabel} — строка ${client.rowIndex}` +
      (client.score ? ` (score ${client.score})` : "") +
      (client.email ? `, ${client.email}` : "") +
      (client.phone ? `, ${client.phone}` : ""),
  );

  return [
    "Точных совпадений нет, но есть похожие:",
    ...lines,
    "",
    "Уточните фамилию, телефон или email — или выберите клиента из списка.",
  ].join("\n");
}

export function formatClientNotFoundReply(): string {
  return "Клиент не найден в таблицах **Клиенты** и **Новые клиенты**.";
}

export function formatDebugClientReply(
  query: string,
  clients: ClientContext[],
  morphology?: NormalizedNameParts,
  rawHits: ClientDebugScanHit[] = [],
  dedupGroups?: Array<{
    parts: ClientContext[];
    mergeReasons: string[];
    mergedName: string;
  }>,
): string {
  const normalizedLabel = morphology
    ? formatNormalizedQueryLabel(morphology)
    : null;
  const candidateName = morphology?.rawTokens.join(" ") ?? query;

  const lines = [
    `**/debug_client**`,
    `Исходный запрос: ${query}`,
    candidateName !== query ? `Candidate name: ${candidateName}` : "",
    normalizedLabel ? `Нормализовано: ${normalizedLabel}` : "",
    "",
  ].filter(Boolean);

  if (rawHits.length > 0) {
    lines.push("**Raw scan (token in row):**");
    for (const hit of rawHits.slice(0, 12)) {
      lines.push(
        `- ${hit.source}, строка ${hit.rowIndex}, колонка «${hit.column}»: «${hit.value.slice(0, 120)}» (token: ${hit.matchedToken})`,
      );
    }
    lines.push("");
  } else {
    lines.push("Raw scan: совпадений по токенам в строках не найдено.", "");
  }

  if (clients.length === 0) {
    lines.push("Scored candidates: нет (score < 35).");
    return lines.join("\n");
  }

  lines.push(`Scored candidates: ${clients.length}`, "");

  if (dedupGroups && dedupGroups.length > 0) {
    lines.push("**Deduplication groups:**");
    dedupGroups.forEach((group, index) => {
      lines.push(
        `${index + 1}. **${group.mergedName}** — ${group.parts.length} записей` +
          (group.mergeReasons.length > 0
            ? ` (${group.mergeReasons.join(", ")})`
            : ""),
      );
      for (const part of group.parts) {
        lines.push(
          `   - ${part.name} | ${part.sourceLabel} | строка ${part.rowIndex} | score ${part.score}`,
        );
      }
    });
    lines.push("");
    const mergedPreview = dedupGroups
      .filter((group) => group.parts.length > 1)
      .map((group) => group.mergedName);
    if (mergedPreview.length > 0) {
      lines.push(`**Merged as:** ${mergedPreview.join("; ")}`, "");
    }
  }

  lines.push(
    clients
      .map((client) => {
        const matched =
          client.matchedFields.length > 0
            ? client.matchedFields.map((field) => `- ${field}`).join("\n")
            : "- (нет детализации полей)";
        const rowJson = JSON.stringify(client.debugRow, null, 2);

        return [
          `Найден клиент: ${client.name}`,
          `Источник: ${client.sourceLabel}`,
          `Строка: ${client.rowIndex}`,
          `Score: ${client.score}`,
          `Matched fields:`,
          matched,
          "",
          "Raw row JSON:",
          "```json",
          rowJson,
          "```",
        ].join("\n");
      })
      .join("\n\n---\n\n"),
  );

  return lines.join("\n");
}
