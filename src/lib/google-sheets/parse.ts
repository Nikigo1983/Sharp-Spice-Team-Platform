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
    status: row.status || "—",
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
  return headers.findIndex((h) =>
    h.length > 0 &&
    normalizedCandidates.some(
      (c) => h === c || (c.length > 3 && h.includes(c)),
    ),
  );
}

function pickFirstNonEmpty(values: Array<string | undefined | null>): string {
  for (const v of values) {
    const s = (v ?? "").trim();
    if (s) return s;
  }
  return "";
}

/**
 * Парсер таблицы "Клиенты Хорватия" (вкладка External).
 * Приводит данные к нашей модели Client, чтобы `ClientsList` показывал синхронизированные записи.
 */
export function parseCroatiaExternalClientsRows(rows: string[][]): Client[] {
  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizeHeader);
  // Fallback to known External tab layout (A..M), if header text differs.
  const COL = {
    family: 0,
    familyLatinOrExtra: 1,
    passport: 2,
    submittedAt: 3,
    submittedAt2: 4,
    expectedApproval: 5,
    referent: 6,
    bookingAddress: 7,
    bookingRange: 8,
    approvalAt: 9,
    notes: 10,
    residenceCardIssuedAt: 11,
    appPassword: 12,
  } as const;

  const idxFamily = findHeaderIndex(headers, ["фамилия", "surname", "last name"]);
  const idxPassport = findHeaderIndex(headers, ["номер паспорта", "паспорт", "passport"]);
  const idxRef = findHeaderIndex(headers, ["имя референта", "референт", "менеджер", "manager"]);

  const idxDateSubmit = findHeaderIndex(headers, ["дата подачи", "дата подачи клиента", "created at"]);
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

  const direction = "Хорватия";
  const country = "Хорватия";

  return rows.slice(1).flatMap((row, index) => {
    const family =
      pickFirstNonEmpty([
        idxFamily >= 0 ? row[idxFamily] : "",
        row[COL.family],
      ]) || "";
    const passport =
      pickFirstNonEmpty([
        idxPassport >= 0 ? row[idxPassport] : "",
        row[COL.passport],
      ]) || "";
    if (!family && !passport) return [];

    const notes =
      pickFirstNonEmpty([
        idxNotes >= 0 ? row[idxNotes] : "",
        row[COL.notes],
      ]) || "";
    const approvalRaw =
      pickFirstNonEmpty([
        idxApproval >= 0 ? row[idxApproval] : "",
        row[COL.approvalAt],
      ]) || "";

    const notesLc = notes.toLowerCase();
    const isApproved =
      Boolean(approvalRaw) ||
      /одобрено|одобрено.*внж|внж|временн(ое|ая) проживани|временное/i.test(notes);

    const isWaiting = /лист ожидания|очеред/i.test(notesLc);

    const isPrepDocs =
      /дозапрос|допзапрос|пошлин|документ|букинг|запрос|проверка|отправл/i.test(
        notesLc,
      );

    let status: Client["status"];
    if (isApproved) status = "Завершён";
    else if (isWaiting) status = "Консультация";
    else if (isPrepDocs) status = "В работе";
    else status = "Новый";

    const createdAt =
      pickFirstNonEmpty([
        idxDateSubmit >= 0 ? row[idxDateSubmit] : "",
        row[COL.submittedAt],
        idxDateSubmit2 >= 0 ? row[idxDateSubmit2] : "",
        row[COL.submittedAt2],
      ]) || "—";

    const lastActivity =
      pickFirstNonEmpty([
        idxBookingRange >= 0 ? row[idxBookingRange] : "",
        row[COL.bookingRange],
        idxApproval >= 0 ? row[idxApproval] : "",
        row[COL.approvalAt],
        idxDateSubmit2 >= 0 ? row[idxDateSubmit2] : "",
        row[COL.submittedAt2],
        idxDateSubmit >= 0 ? row[idxDateSubmit] : "",
        row[COL.submittedAt],
      ]) || "—";

    const manager =
      pickFirstNonEmpty([
        idxRef >= 0 ? row[idxRef] : "",
        row[COL.referent],
      ]) || "";
    const bookingAddress =
      pickFirstNonEmpty([
        idxBookingAddress >= 0 ? row[idxBookingAddress] : "",
        row[COL.bookingAddress],
      ]) || "";

    const clientId = passport || `ROW-${index + 2}`;

    return [
      {
        id: clientId,
        name: family || "—",
        phone: "—",
        email: "—",
        country,
        citizenship: "—",
        direction,
        status,
        manager: manager || "—",
        lastActivity,
        createdAt,
        passportNumber: passport || "—",
        submittedAt:
          pickFirstNonEmpty([
            idxDateSubmit >= 0 ? row[idxDateSubmit] : "",
            row[COL.submittedAt],
          ]) || "—",
        submittedAt2: pickFirstNonEmpty([
          idxDateSubmit2 >= 0 ? row[idxDateSubmit2] : "",
          row[COL.submittedAt2],
        ]) || "—",
        expectedApprovalAt:
          pickFirstNonEmpty([
            idxExpectedApproval >= 0 ? row[idxExpectedApproval] : "",
            row[COL.expectedApproval],
          ]) || "—",
        referentName: manager || "—",
        bookingAddress: bookingAddress || "—",
        bookingRange:
          pickFirstNonEmpty([
            idxBookingRange >= 0 ? row[idxBookingRange] : "",
            row[COL.bookingRange],
          ]) || "—",
        approvalAt: approvalRaw || "—",
        notes: notes || "—",
        residenceCardIssuedAt:
          pickFirstNonEmpty([
            idxResidenceCard >= 0 ? row[idxResidenceCard] : "",
            row[COL.residenceCardIssuedAt],
          ]) || "—",
        appPassword:
          pickFirstNonEmpty([
            idxAppPassword >= 0 ? row[idxAppPassword] : "",
            row[COL.appPassword],
          ]) || "—",
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
