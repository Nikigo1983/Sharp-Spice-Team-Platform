import {
  deriveCroatiaExternalStatus,
  formatStatusForAiContext,
  logClientStatusDebug,
  sanitizeCrmClientStatus,
} from "@/lib/ai/client-status";
import type { Client, ClientDocument, ClientNote, ClientSurvey } from "./types";

const CLIENT_HEADER_MAP: Record<string, keyof Client> = {
  id: "id",
  "№": "id",
  "номер": "id",
  "client id": "id",
  имя: "name",
  name: "name",
  "фио": "name",
  телефон: "phone",
  phone: "phone",
  email: "email",
  "e-mail": "email",
  страна: "country",
  country: "country",
  гражданство: "citizenship",
  citizenship: "citizenship",
  направление: "direction",
  direction: "direction",
  статус: "status",
  status: "status",
  менеджер: "manager",
  "ответственный менеджер": "manager",
  manager: "manager",
  "последняя активность": "lastActivity",
  "last activity": "lastActivity",
  "дата создания": "createdAt",
  "created at": "createdAt",
  "дата создания клиента": "createdAt",
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function rowsToObjects<T extends Record<string, string>>(
  rows: string[][],
  headerMap: Record<string, keyof T>,
): T[] {
  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizeHeader);
  const keys = headers.map((h) => headerMap[h] ?? null);

  return rows.slice(1).flatMap((row, index) => {
    const item = {} as T;
    let hasValue = false;

    keys.forEach((key, colIndex) => {
      if (!key) return;
      const value = (row[colIndex] ?? "").trim();
      if (value) hasValue = true;
      (item as Record<string, string>)[key as string] = value;
    });

    if (!hasValue) return [];
    (item as Record<string, unknown>).rowIndex = index + 2;
    return [item];
  });
}

type ClientRow = Record<string, string> & { rowIndex?: number };

export function parseClientRows(rows: string[][]): Client[] {
  const parsed = rowsToObjects<ClientRow>(rows, CLIENT_HEADER_MAP);
  return parsed.map((row, index) => ({
    id: row.id || `ROW-${index + 2}`,
    name: row.name || "—",
    phone: row.phone || "—",
    email: row.email || "—",
    country: row.country || "—",
    citizenship: row.citizenship || "—",
    direction: row.direction || "—",
    status: sanitizeCrmClientStatus(row.status),
    manager: row.manager || "—",
    lastActivity: row.lastActivity || "—",
    createdAt: row.createdAt || "—",
    rowIndex:
      typeof row.rowIndex === "number"
        ? row.rowIndex
        : Number(row.rowIndex) || index + 2,
  }));
}

function findHeaderIndex(headers: string[], candidates: string[]): number {
  const normalizedCandidates = candidates.map(normalizeHeader);
  // Сначала точное совпадение, затем частичное — чтобы «дата подачи» не путалась с «дата подачи 2».
  for (const candidate of normalizedCandidates) {
    const exact = headers.findIndex((h) => h.length > 0 && h === candidate);
    if (exact >= 0) return exact;
  }
  for (const candidate of normalizedCandidates) {
    if (candidate.length <= 3) continue;
    const partial = headers.findIndex((h) => h.length > 0 && h.includes(candidate));
    if (partial >= 0) return partial;
  }
  return -1;
}

function pickCell(
  row: string[],
  headerIdx: number,
  fallbackCol?: number,
): string {
  if (headerIdx >= 0) return (row[headerIdx] ?? "").trim();
  if (fallbackCol !== undefined && fallbackCol >= 0) {
    return (row[fallbackCol] ?? "").trim();
  }
  return "";
}

/** Шапка без колонки латиницы: «Номер паспорта» в B, данные — латиница в B, паспорт в C. */
function isExternalLatinColumnShift(
  idxFamily: number,
  idxPassport: number,
  familyCol: number,
  latinCol: number,
): boolean {
  return (
    (idxFamily < 0 || idxFamily === familyCol) && idxPassport === latinCol
  );
}

function pickExternalCell(
  row: string[],
  headerIdx: number,
  fixedCol: number,
  useFixedLayout: boolean,
): string {
  if (useFixedLayout) return pickCell(row, -1, fixedCol);
  return pickCell(row, headerIdx, fixedCol);
}

/**
 * Парсер таблицы "Клиенты Хорватия" (вкладка External).
 * Приводит данные к нашей модели Client, чтобы `ClientsList` показывал синхронизированные записи.
 */
export function parseCroatiaExternalClientsRows(rows: string[][]): Client[] {
  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizeHeader);
  // Актуальная раскладка вкладки External (Google Sheets, gid=1431336126).
  const COL = {
    family: 0,
    familyLatin: 1,
    passport: 2,
    submittedAt: 3,
    expectedApproval: 4,
    referent: 5,
    bookingAddress: 6,
    bookingRange: 7,
    approvalAt: 8,
    notes: 9,
    residenceCardIssuedAt: 10,
    appPassword: 11,
    partner: 12,
  } as const;

  const idxFamily = findHeaderIndex(headers, ["фамилия", "surname", "last name"]);
  const idxPassport = findHeaderIndex(headers, ["номер паспорта", "паспорт", "passport"]);
  const idxRef = findHeaderIndex(headers, ["имя референта", "референт", "менеджер", "manager"]);

  const idxDateSubmit = findHeaderIndex(headers, [
    "дата подачи",
    "дата подачи клиента",
    "created at",
  ]);
  const idxDateSubmit2 = findHeaderIndex(headers, ["дата подачи 2"]);
  const idxExpectedApproval = findHeaderIndex(headers, [
    "дата предпологаемого одобрения",
    "дата предполагаемого одобрения",
    "предполагаемого одобрения",
  ]);
  const idxBookingRange = findHeaderIndex(headers, [
    "дата букинга (от и до)",
    "дата букинга",
    "booking",
  ]);
  const idxBookingAddress = findHeaderIndex(headers, [
    "адрес букинга",
    "адрес для букинга",
    "booking address",
  ]);
  const idxApproval = findHeaderIndex(headers, ["дата одобрения внж", "дата одобрения", "approval"]);
  const idxNotes = findHeaderIndex(headers, ["заметки", "заметка", "notes", "note"]);
  const idxResidenceCard = findHeaderIndex(headers, [
    "дата выдачи карточки внж",
    "дата выдачи карточки",
  ]);
  const idxAppPassword = findHeaderIndex(headers, ["пароль для приложения", "пароль"]);

  const useFixedLayout = isExternalLatinColumnShift(
    idxFamily,
    idxPassport,
    COL.family,
    COL.familyLatin,
  );

  const direction = "Хорватия";
  const country = "Хорватия";

  return rows.slice(1).flatMap((row, index) => {
    const family = pickExternalCell(row, idxFamily, COL.family, useFixedLayout);
    const familyLatin = pickCell(row, -1, COL.familyLatin);
    const passport = pickExternalCell(
      row,
      idxPassport,
      COL.passport,
      useFixedLayout,
    );
    if (!family && !passport) return [];

    const notes = pickExternalCell(row, idxNotes, COL.notes, useFixedLayout);
    const approvalRaw = pickExternalCell(
      row,
      idxApproval,
      COL.approvalAt,
      useFixedLayout,
    );

    const { status, derivation } = deriveCroatiaExternalStatus(notes, approvalRaw);
    const familyName = family || "—";

    logClientStatusDebug({
      name: familyName,
      source: "Клиенты",
      rawStatus: status,
      finalStatus: formatStatusForAiContext(status, "clients"),
      derivation,
    });

    const createdAt =
      pickExternalCell(row, idxDateSubmit, COL.submittedAt, useFixedLayout) ||
      "—";

    const submittedAt2Raw = pickCell(row, idxDateSubmit2);
    const submittedAt2 =
      idxDateSubmit2 >= 0 && submittedAt2Raw ? submittedAt2Raw : "—";

    const expectedApprovalAt =
      pickExternalCell(
        row,
        idxExpectedApproval,
        COL.expectedApproval,
        useFixedLayout,
      ) || "—";

    const referentName =
      pickExternalCell(row, idxRef, COL.referent, useFixedLayout) || "—";
    const bookingAddress =
      pickExternalCell(
        row,
        idxBookingAddress,
        COL.bookingAddress,
        useFixedLayout,
      ) || "—";
    const bookingRange =
      pickExternalCell(
        row,
        idxBookingRange,
        COL.bookingRange,
        useFixedLayout,
      ) || "—";

    const lastActivity =
      bookingRange !== "—"
        ? bookingRange
        : approvalRaw || createdAt || "—";

    const clientId = passport || `ROW-${index + 2}`;

    return [
      {
        id: clientId,
        name: familyName,
        phone: "—",
        email: "—",
        country,
        citizenship: familyLatin || "—",
        direction,
        status,
        manager: referentName !== "—" ? referentName : "—",
        lastActivity,
        createdAt,
        passportNumber: passport || "—",
        submittedAt: createdAt,
        submittedAt2,
        expectedApprovalAt,
        referentName,
        bookingAddress,
        bookingRange,
        approvalAt: approvalRaw || "—",
        notes: notes || "—",
        residenceCardIssuedAt:
          pickExternalCell(
            row,
            idxResidenceCard,
            COL.residenceCardIssuedAt,
            useFixedLayout,
          ) || "—",
        appPassword:
          pickExternalCell(
            row,
            idxAppPassword,
            COL.appPassword,
            useFixedLayout,
          ) || "—",
        rowIndex: index + 2,
      },
    ];
  });
}

export function parseSurveyRows(rows: string[][]): ClientSurvey[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);

  return rows.slice(1).flatMap((row, index) => {
    const get = (names: string[]) => {
      const idx = headers.findIndex((h) => names.includes(h));
      return idx >= 0 ? (row[idx] ?? "").trim() : "";
    };

    const clientId = get(["client id", "id клиента", "клиент", "clientid"]);
    const title = get(["анкета", "название", "title", "form"]);
    if (!clientId && !title) return [];

    return [
      {
        id: get(["id", "№"]) || `SV-${index}`,
        clientId,
        title: title || "Анкета",
        filledAt: get(["дата", "дата заполнения", "filled at", "filledat"]),
        processingStatus: get([
          "статус",
          "статус обработки",
          "processing status",
        ]) || "—",
      },
    ];
  });
}

export function parseDocumentRows(rows: string[][]): ClientDocument[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);

  return rows.slice(1).flatMap((row, index) => {
    const get = (names: string[]) => {
      const idx = headers.findIndex((h) => names.includes(h));
      return idx >= 0 ? (row[idx] ?? "").trim() : "";
    };

    const clientId = get(["client id", "id клиента", "клиент"]);
    const name = get(["название", "документ", "name", "file"]);
    if (!clientId && !name) return [];

    return [
      {
        id: get(["id", "№"]) || `DOC-${index}`,
        clientId,
        name: name || "Документ",
        uploadedAt: get(["дата", "дата загрузки", "uploaded at"]) || "—",
        category: get(["категория", "category", "тип"]) || "—",
      },
    ];
  });
}

export function parseNoteRows(rows: string[][]): ClientNote[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);

  return rows.slice(1).flatMap((row, index) => {
    const get = (names: string[]) => {
      const idx = headers.findIndex((h) => names.includes(h));
      return idx >= 0 ? (row[idx] ?? "").trim() : "";
    };

    const clientId = get(["client id", "id клиента", "клиент"]);
    const text = get(["заметка", "текст", "note", "text", "комментарий"]);
    if (!clientId || !text) return [];

    return [
      {
        id: get(["id", "№"]) || `NT-${index}`,
        clientId,
        createdAt: get(["дата", "date", "created at"]) || "—",
        author: get(["автор", "менеджер", "author"]) || "—",
        text,
        rowIndex: index + 2,
      },
    ];
  });
}

export function clientMatchesSearch(client: Client, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [client.name, client.phone, client.email, client.country].some((field) =>
    field.toLowerCase().includes(q),
  );
}

export function clientMatchesFilters(
  client: Client,
  filters: {
    direction?: string;
    status?: string;
    manager?: string;
    country?: string;
  },
): boolean {
  if (filters.direction && client.direction !== filters.direction) return false;
  if (filters.status && client.status !== filters.status) return false;
  if (filters.manager && client.manager !== filters.manager) return false;
  if (filters.country && client.country !== filters.country) return false;
  return true;
}
