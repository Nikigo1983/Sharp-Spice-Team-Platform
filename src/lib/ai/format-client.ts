import {
  formatStatusForAiContext,
  sanitizeCrmClientStatus,
} from "@/lib/ai/client-status";
import type { Client } from "@/lib/google-sheets/types";

function displayField(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "—" ? trimmed : "";
}

/** Все заполненные колонки таблицы «Клиенты» для AI и debug row. */
export function buildCrmClientDebugRow(client: Client): Record<string, string> {
  const rawStatus = sanitizeCrmClientStatus(client.status);
  const row: Record<string, string> = {
    id: displayField(client.id),
    name: displayField(client.name),
    latinName: displayField(client.citizenship),
    passport: displayField(client.passportNumber),
    email: displayField(client.email),
    submittedAt: displayField(client.submittedAt ?? client.createdAt),
    expectedApprovalAt: displayField(client.expectedApprovalAt),
    referentName: displayField(client.referentName ?? client.manager),
    bookingAddress: displayField(client.bookingAddress),
    bookingRange: displayField(client.bookingRange),
    approvalAt: displayField(client.approvalAt),
    notes: displayField(client.notes)?.slice(0, 500) ?? "",
    residenceCardIssuedAt: displayField(client.residenceCardIssuedAt),
    partner: displayField(client.partnerName),
    contract: displayField(client.contract),
    manager: displayField(client.manager),
    direction: displayField(client.direction),
    status: rawStatus,
    statusForAi: formatStatusForAiContext(rawStatus, "clients"),
  };

  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => Boolean(value)),
  );
}

function crmExtraFieldLines(client: Client): string[] {
  return [
    client.citizenship && client.citizenship !== "—"
      ? `Латиница: ${client.citizenship}`
      : "",
    client.partnerName && client.partnerName !== "—"
      ? `Партнер от кого клиент: ${client.partnerName}`
      : "",
    client.contract && client.contract !== "—"
      ? `Договор: ${client.contract}`
      : "",
  ].filter(Boolean);
}

/** Поля клиента для AI — все колонки таблицы «Клиенты Хорватия». */
export function formatClientForAi(client: Client): string {
  const referent =
    displayField(client.referentName) || displayField(client.manager);
  const lines = [
    `ФИО/фамилия: ${client.name}`,
    ...crmExtraFieldLines(client),
    client.passportNumber && client.passportNumber !== "—"
      ? `Паспорт: ${client.passportNumber}`
      : "",
    client.email && client.email !== "—" ? `Email: ${client.email}` : "",
    `Направление: ${client.direction}`,
    `Статус: ${formatStatusForAiContext(sanitizeCrmClientStatus(client.status), "clients")}`,
    referent ? `Имя референта: ${referent}` : "",
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
      ? `Предполагаемое одобрение: ${client.expectedApprovalAt}`
      : "",
    client.approvalAt && client.approvalAt !== "—"
      ? `Дата одобрения ВНЖ: ${client.approvalAt}`
      : "",
    client.residenceCardIssuedAt && client.residenceCardIssuedAt !== "—"
      ? `Дата выдачи карточки ВНЖ: ${client.residenceCardIssuedAt}`
      : "",
    client.notes && client.notes !== "—"
      ? `Заметки: ${client.notes.slice(0, 500)}`
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
  const latin =
    client.citizenship && client.citizenship !== "—"
      ? client.citizenship
      : "латиница не указана";
  const partner =
    client.partnerName && client.partnerName !== "—"
      ? client.partnerName
      : "партнер не указан";
  const contract =
    client.contract && client.contract !== "—"
      ? client.contract
      : "договор не указан";
  return `- ${client.name} | латиница ${latin} | паспорт ${client.passportNumber ?? "—"} | партнер ${partner} | договор ${contract} | адрес букинга: ${address} | даты букинга: ${dates} | статус ${status}`;
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
