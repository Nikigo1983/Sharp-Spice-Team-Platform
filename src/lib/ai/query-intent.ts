export type WorkspaceQueryIntent = {
  /** Букинг/адрес конкретного клиента — ответ из таблицы без AI */
  fastClientLookup: boolean;
  needsKb: boolean;
  /** Полный текст документов (медленно) */
  needsKbFullText: boolean;
  needsClients: boolean;
  needsFormgrid: boolean;
};

export function detectWorkspaceIntent(query: string): WorkspaceQueryIntent {
  const lower = query.toLowerCase();

  const hasClientName = /(?:клиент[а-я]*|у)\s+[а-яё\-]{3,}/iu.test(query);
  const fastClientLookup =
    hasClientName &&
    (lower.includes("букинг") ||
      lower.includes("адрес") ||
      lower.includes("паспорт") ||
      lower.includes("статус"));

  const needsFormgrid =
    lower.includes("formgrid") ||
    lower.includes("анкет") ||
    lower.includes("заявк") ||
    lower.includes("лид");

  const needsKb =
    lower.includes("база знан") ||
    lower.includes("knowledge") ||
    lower.includes("документ") ||
    lower.includes("программ") ||
    lower.includes("digital nomad") ||
    lower.includes("внж") ||
    lower.includes("требован") ||
    lower.includes("immigration") ||
    lower.includes("иммиграц") ||
    lower.includes("drive") ||
    lower.includes("pdf");

  const needsClients =
    !needsKb ||
    needsFormgrid ||
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
      lower.includes("документ") ||
      lower.includes("программ") ||
      lower.includes("чек"));

  return {
    fastClientLookup,
    needsKb: needsKb && !fastClientLookup,
    needsKbFullText,
    needsClients: needsClients || !needsFormgrid,
    needsFormgrid,
  };
}
