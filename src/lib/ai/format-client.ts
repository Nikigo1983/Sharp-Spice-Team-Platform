import {
  formatStatusForAiContext,
  sanitizeCrmClientStatus,
} from "@/lib/ai/client-status";
import type { Client } from "@/lib/google-sheets/types";

/** Поля клиента для AI — все колонки таблицы «Клиенты Хорватия». */
export function formatClientForAi(client: Client): string {
  const lines = [
    `ФИО/фамилия: ${client.name}`,
    client.passportNumber && client.passportNumber !== "—"
      ? `Паспорт: ${client.passportNumber}`
      : "",
    `Направление: ${client.direction}`,
    `Статус: ${formatStatusForAiContext(sanitizeCrmClientStatus(client.status), "clients")}`,
    client.manager && client.manager !== "—"
      ? `Менеджер/референт: ${client.manager}`
      : "",
    client.bookingAddress && client.bookingAddress !== "—"
      ? `Адрес букинга: ${client.bookingAddress}`
      : "Адрес букинга: не указан",
    client.bookingRange && client.bookingRange !== "—"
      ? `Даты букинга: ${client.bookingRange}`
      : "",
    client.submittedAt && client.submittedAt !== "—"
      ? `Дата подачи: ${client.submittedAt}`
      : "",
    client.expectedApprovalAt && client.expectedApprovalAt !== "—"
      ? `Ожидаемое одобрение: ${client.expectedApprovalAt}`
      : "",
    client.approvalAt && client.approvalAt !== "—"
      ? `Дата одобрения: ${client.approvalAt}`
      : "",
    client.notes && client.notes !== "—"
      ? `Заметки: ${client.notes.slice(0, 400)}`
      : "",
  ].filter(Boolean);

  return lines.join("\n");
}

export function formatClientOneLiner(client: Client): string {
  const address =
    client.bookingAddress && client.bookingAddress !== "—"
      ? client.bookingAddress
      : "адрес не указан";
  const dates =
    client.bookingRange && client.bookingRange !== "—"
      ? client.bookingRange
      : "даты не указаны";
  const status = formatStatusForAiContext(
    sanitizeCrmClientStatus(client.status),
    "clients",
  );
  return `- ${client.name} | паспорт ${client.passportNumber ?? "—"} | адрес букинга: ${address} | даты букинга: ${dates} | статус ${status}`;
}

/** Отсекает латиницу ФИО, ошибочно попавшую в колонку паспорта. */
export function looksLikePassportNumber(value: string): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed === "—") return false;
  if (/\s/.test(trimmed) && !/\d/.test(trimmed)) return false;
  const alnum = trimmed.replace(/[^\p{L}\p{N}]/gu, "");
  return alnum.length >= 6 && /\d/.test(alnum);
}

/** Короткий ответ менеджеру на вопрос про номер паспорта. */
export function formatPassportLookupReply(
  clientName: string,
  passport: string,
  rowIndex?: number,
): string {
  const row = rowIndex && rowIndex > 0 ? ` · строка ${rowIndex}` : "";
  return `**${passport}** — паспорт ${clientName} · таблица «Клиенты»${row}`;
}

export function formatPassportMissingReply(
  clientName: string,
  rowIndex?: number,
): string {
  const row = rowIndex && rowIndex > 0 ? ` (строка ${rowIndex})` : "";
  return `У **${clientName}** в таблице «Клиенты» колонка «Номер паспорта» пуста${row}.`;
}
