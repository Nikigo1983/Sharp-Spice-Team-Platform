import "server-only";

export type ClientStatusSource = "clients" | "new_clients" | "merged";

/** Внутреннее значение «статус не задан» в модели Client. */
export const CLIENT_STATUS_UNSPECIFIED = "—";

/** Статус для анкет Formgrid (не путать с источником «Новые клиенты»). */
export const FORMGRID_LEAD_STATUS = "Новая заявка";

const DEBUG_STATUS_NAMES = /акунов|алмастанова/i;

export type CroatiaStatusDerivation =
  | "approved"
  | "waiting_list"
  | "prep_docs"
  | "unspecified";

export type CroatiaStatusResult = {
  status: string;
  derivation: CroatiaStatusDerivation;
};

/**
 * Таблица «Клиенты Хорватия» (External) не имеет колонки «статус».
 * Статус выводится из заметок / даты одобрения. Fallback — не «Новый».
 */
export function deriveCroatiaExternalStatus(
  notes: string,
  approvalRaw: string,
): CroatiaStatusResult {
  const notesLc = notes.toLowerCase();
  const isApproved =
    Boolean(approvalRaw) ||
    /одобрено|одобрено.*внж|внж|временн(ое|ая) проживани|временное/i.test(
      notes,
    );
  const isWaiting = /лист ожидания|очеред/i.test(notesLc);
  const isPrepDocs =
    /дозапрос|допзапрос|пошлин|документ|букинг|запрос|проверка|отправл/i.test(
      notesLc,
    );

  if (isApproved) {
    return { status: "Завершён", derivation: "approved" };
  }
  if (isWaiting) {
    return { status: "Консультация", derivation: "waiting_list" };
  }
  if (isPrepDocs) {
    return { status: "В работе", derivation: "prep_docs" };
  }
  return { status: CLIENT_STATUS_UNSPECIFIED, derivation: "unspecified" };
}

/** Нормализация статуса CRM: «Новый» для таблицы Клиенты недопустим. */
export function sanitizeCrmClientStatus(status: string | undefined): string {
  const trimmed = (status ?? "").trim();
  if (!trimmed || trimmed === CLIENT_STATUS_UNSPECIFIED || trimmed === "Новый") {
    return CLIENT_STATUS_UNSPECIFIED;
  }
  return trimmed;
}

/**
 * Статус для AI CONTEXT / Claude.
 * Источник «Новые клиенты» ≠ статус «Новая заявка».
 */
export function formatStatusForAiContext(
  status: string,
  source: ClientStatusSource,
): string {
  if (source === "new_clients") {
    return status.trim() || FORMGRID_LEAD_STATUS;
  }

  const normalized = sanitizeCrmClientStatus(status);
  if (normalized === CLIENT_STATUS_UNSPECIFIED) {
    return "Статус не указан";
  }
  return normalized;
}

export function logClientStatusDebug(params: {
  name: string;
  source: string;
  rawStatus: string;
  finalStatus: string;
  derivation?: string;
}): void {
  if (!DEBUG_STATUS_NAMES.test(params.name)) return;

  console.log("CLIENT DEBUG");
  console.log(`ФИО: ${params.name}`);
  console.log(`SOURCE: ${params.source}`);
  console.log(`RAW STATUS: ${params.rawStatus || CLIENT_STATUS_UNSPECIFIED}`);
  if (params.derivation) {
    console.log(`DERIVATION: ${params.derivation}`);
  }
  console.log(`FINAL STATUS: ${params.finalStatus}`);
}
