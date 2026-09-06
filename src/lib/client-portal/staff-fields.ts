/** Staff-only CRM fields for submitted client-portal questionnaires. */
export type QuestionnaireStaffFields = {
  contractNumber: string;
  contractAmount: string;
  company: string;
  curator: string;
  expectedApproval: string;
  bookingAddress: string;
  bookingDate: string;
  trpApprovalDate: string;
  trpCardIssueDate: string;
  partner: string;
};

export const EMPTY_STAFF_FIELDS: QuestionnaireStaffFields = {
  contractNumber: "",
  contractAmount: "",
  company: "",
  curator: "",
  expectedApproval: "",
  bookingAddress: "",
  bookingDate: "",
  trpApprovalDate: "",
  trpCardIssueDate: "",
  partner: "",
};

export const STAFF_FIELD_COLUMNS: Array<{
  key: keyof QuestionnaireStaffFields;
  label: string;
}> = [
  { key: "contractNumber", label: "Номер договора" },
  { key: "contractAmount", label: "Сумма договора" },
  { key: "company", label: "Компания" },
  { key: "curator", label: "Куратор" },
  { key: "expectedApproval", label: "Предполагаемое одобрение" },
  { key: "bookingAddress", label: "Адрес букинга" },
  { key: "bookingDate", label: "Дата букинга" },
  { key: "trpApprovalDate", label: "Дата одобрения ВНЖ" },
  { key: "trpCardIssueDate", label: "Дата выдачи карточки ВНЖ" },
  { key: "partner", label: "Партнер от кого клиент" },
];

const STAFF_ANSWERS_KEY = "__staff";

export function readStaffFields(
  answers: Record<string, unknown> | null | undefined,
): QuestionnaireStaffFields {
  const raw = answers?.[STAFF_ANSWERS_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_STAFF_FIELDS };
  }
  const obj = raw as Record<string, unknown>;
  const next = { ...EMPTY_STAFF_FIELDS };
  for (const key of Object.keys(EMPTY_STAFF_FIELDS) as Array<
    keyof QuestionnaireStaffFields
  >) {
    const value = obj[key];
    next[key] = typeof value === "string" ? value : "";
  }
  return next;
}

export function writeStaffFields(
  answers: Record<string, unknown>,
  fields: Partial<QuestionnaireStaffFields>,
): Record<string, unknown> {
  const current = readStaffFields(answers);
  return {
    ...answers,
    [STAFF_ANSWERS_KEY]: {
      ...current,
      ...fields,
    },
  };
}
