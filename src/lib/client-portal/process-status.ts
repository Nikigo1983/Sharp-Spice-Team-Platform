export const INITIAL_PROCESS_STATUS =
  "Заявка, форма и документы получены";

/** All staff-selectable process statuses, including the initial auto status. */
export const PROCESS_STATUS_OPTIONS = [
  INITIAL_PROCESS_STATUS,
  "Документы на проверке",
  "Оплата получена",
  "Документы переданы судебному переводчику",
  "Переводы получены",
  "Заявка подана",
  "Назначен куратор-референт",
  "Документы переданы миграционному адвокату",
  "Проверка адреса",
  "Отчёт по адресу отправлен",
  "Проверка службы безопасности",
  "Отчёт службы безопасности отправлен",
  "Ожидание от службы безопасности",
  "Отчёты переданы куратору",
  "Куратор инициировал новую проверку адреса",
  "Финальный пакет документов передан куратору",
  "Гос. пошлина за одобрение оплачена",
  "Ожидание одобрения",
  "ВНЖ одобрен",
  "Подтверждение отправлено в консульство",
  "Документы поданы на визу D",
  "Виза D одобрена",
  "Виза D не одобрена",
  "Регистрация адреса",
  "Сдача биометрии",
  "Получение пластиковой карты",
] as const;

export type ProcessStatusValue = (typeof PROCESS_STATUS_OPTIONS)[number];

export type ProcessStatusState = {
  value: ProcessStatusValue;
  updatedAt: string | null;
  updatedByUserId: string | null;
  updatedByName: string | null;
};

const STATUS_KEY = "__staff_process_status";

const OPTION_SET = new Set<string>(PROCESS_STATUS_OPTIONS);

export function isProcessStatusValue(value: string): value is ProcessStatusValue {
  return OPTION_SET.has(value);
}

function asProcessStatusState(value: unknown): ProcessStatusState | null {
  if (typeof value === "string" && isProcessStatusValue(value)) {
    return {
      value,
      updatedAt: null,
      updatedByUserId: null,
      updatedByName: null,
    };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.value !== "string" || !isProcessStatusValue(rec.value)) {
    return null;
  }
  return {
    value: rec.value,
    updatedAt: typeof rec.updatedAt === "string" ? rec.updatedAt : null,
    updatedByUserId:
      typeof rec.updatedByUserId === "string" ? rec.updatedByUserId : null,
    updatedByName:
      typeof rec.updatedByName === "string" ? rec.updatedByName : null,
  };
}

export function readProcessStatus(
  answers: Record<string, unknown> | null | undefined,
  questionnaireStatus?: "draft" | "submitted" | string,
): ProcessStatusState | null {
  const parsed = asProcessStatusState(answers?.[STATUS_KEY]);
  if (parsed) return parsed;
  if (questionnaireStatus === "submitted") {
    return {
      value: INITIAL_PROCESS_STATUS,
      updatedAt: null,
      updatedByUserId: null,
      updatedByName: null,
    };
  }
  return null;
}

export function writeProcessStatus(
  answers: Record<string, unknown>,
  state: ProcessStatusState,
): Record<string, unknown> {
  return {
    ...answers,
    [STATUS_KEY]: {
      value: state.value,
      updatedAt: state.updatedAt,
      updatedByUserId: state.updatedByUserId,
      updatedByName: state.updatedByName,
    },
  };
}

export function processStatusKey(): string {
  return STATUS_KEY;
}
