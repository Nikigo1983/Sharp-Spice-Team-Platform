import { extractPersonNameTokens } from "@/lib/ai/name-matching";

export type WorkspaceQueryIntent = {
  /** Букинг/адрес конкретного клиента — ответ из таблицы без AI */
  fastClientLookup: boolean;
  needsKb: boolean;
  /** Полный текст документов (медленно) */
  needsKbFullText: boolean;
  /** Папка Google Drive «ЭМИГРАНТ» — документы клиентов */
  needsEmigrantDrive: boolean;
  needsEmigrantDriveFullText: boolean;
  /** Запрос явно про папку ЭМИГРАНТ — не обрывать на «клиент не в таблице» */
  emigrantDrivePrimary: boolean;
  needsClients: boolean;
  needsEmigrantDesk: boolean;
  needsFormgrid: boolean;
};

/** Запрос про папку «ЭМИГРАНТ» в Google Drive, а не про таблицы клиентов. */
export function isEmigrantDrivePrimaryQuery(query: string): boolean {
  const lower = query.toLowerCase();
  return (
    lower.includes("эмигрант") ||
    lower.includes("emigrant folder") ||
    lower.includes("emigrant drive") ||
    (lower.includes("папк") &&
      (lower.includes("эмигрант") || lower.includes("emigrant")))
  );
}

export function detectWorkspaceIntent(query: string): WorkspaceQueryIntent {
  const lower = query.toLowerCase();
  const emigrantDrivePrimary = isEmigrantDrivePrimaryQuery(query);

  const hasClientName =
    extractPersonNameTokens(query).length > 0 ||
    /(?:клиент[а-я]*|у)\s+[а-яё\-]{3,}/iu.test(query);
  const fastClientLookup =
    hasClientName &&
    (lower.includes("букинг") ||
      lower.includes("адрес") ||
      lower.includes("статус"));

  const needsFormgrid =
    lower.includes("formgrid") ||
    lower.includes("анкет") ||
    lower.includes("заявк") ||
    lower.includes("лид");

  const needsKb =
    lower.includes("база знан") ||
    lower.includes("knowledge") ||
    lower.includes("программ") ||
    lower.includes("digital nomad") ||
    lower.includes("требован") ||
    lower.includes("immigration") ||
    lower.includes("иммиграц");

  const needsEmigrantDrive =
    emigrantDrivePrimary ||
    lower.includes("эмигрант") ||
    lower.includes("emigrant") ||
    lower.includes("папк") ||
    lower.includes("pdf") ||
    lower.includes("скан") ||
    lower.includes("копи") ||
    lower.includes("паспорт") ||
    lower.includes("документ") ||
    lower.includes("drive") ||
    lower.includes("внж") ||
    (hasClientName &&
      (lower.includes("файл") ||
        lower.includes("документ") ||
        lower.includes("pdf")));

  const needsEmigrantDesk =
    (!emigrantDrivePrimary && lower.includes("emigrant")) ||
    lower.includes("кабинет") ||
    lower.includes("статус дела") ||
    lower.includes("статус клиента") ||
    lower.includes("текущий статус") ||
    lower.includes("внж одобрен") ||
    lower.includes("виза d") ||
    lower.includes("дело №") ||
    lower.includes("дело no") ||
    (lower.includes("статус") && lower.includes("клиент"));

  const needsClients =
    !needsKb ||
    needsFormgrid ||
    needsEmigrantDesk ||
    fastClientLookup ||
    lower.includes("клиент") ||
    lower.includes("букинг") ||
    lower.includes("менеджер") ||
    lower.includes("хорват") ||
    lower.includes("сколько");

  const needsKbFullText =
    needsKb &&
    !fastClientLookup &&
    (lower.includes("сравн") ||
      lower.includes("требован") ||
      lower.includes("программ") ||
      lower.includes("чек"));

  const needsEmigrantDriveFullText =
    needsEmigrantDrive &&
    !fastClientLookup &&
    (emigrantDrivePrimary ||
      lower.includes("содерж") ||
      lower.includes("текст") ||
      lower.includes("что в") ||
      lower.includes("прочит") ||
      lower.includes("открой") ||
      lower.includes("покажи документ") ||
      lower.includes("найди") ||
      lower.includes("информац"));

  return {
    fastClientLookup,
    needsKb: needsKb && !fastClientLookup,
    needsKbFullText,
    needsEmigrantDrive: needsEmigrantDrive && !fastClientLookup,
    needsEmigrantDriveFullText,
    emigrantDrivePrimary,
    needsClients:
      !emigrantDrivePrimary && (needsClients || !needsFormgrid),
    needsEmigrantDesk:
      !emigrantDrivePrimary && (needsEmigrantDesk || needsClients),
    needsFormgrid,
  };
}
