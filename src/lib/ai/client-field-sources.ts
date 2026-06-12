import type {
  ClientContext,
  ClientContextSource,
  MergedClientContext,
} from "@/lib/ai/client-context";
import { extractPassportFromClientRecord } from "@/lib/ai/client-passport";

export type DataSourceLabel = "CRM" | "Formgrid" | "Emigrant Desk";

export type EmigrantDeskContextSlice = {
  name: string;
  email: string;
  caseNumber: string;
  currentStatus: string;
  consulate: string;
  submissionCity: string;
  submissionDate: string;
  statusUpdatedAt: string;
  internalComment: string;
};

export type AttributedField = {
  label: string;
  value: string;
  source: DataSourceLabel;
};

export type FieldConflict = {
  field: string;
  values: Array<{ source: DataSourceLabel; value: string }>;
};

export type ClientContextAttribution = {
  activeSources: DataSourceLabel[];
  fields: AttributedField[];
  conflicts: FieldConflict[];
  managerSummary: string;
};

const SHEET_FIELD_PRIORITY: Record<
  "email" | "phone" | "status" | "manager" | "country" | "direction" | "lastActivity",
  ClientContextSource[]
> = {
  email: ["new_clients", "clients"],
  phone: ["new_clients", "clients"],
  status: ["clients", "new_clients"],
  manager: ["clients", "new_clients"],
  country: ["clients", "new_clients"],
  direction: ["clients", "new_clients"],
  lastActivity: ["clients", "new_clients"],
};

const FIELD_LABELS: Record<keyof typeof SHEET_FIELD_PRIORITY, string> = {
  email: "Email",
  phone: "Телефон",
  status: "Статус",
  manager: "Менеджер",
  country: "Страна",
  direction: "Направление",
  lastActivity: "Последняя активность",
};

export function partSourceLabel(part: ClientContext): DataSourceLabel {
  return part.source === "clients" ? "CRM" : "Formgrid";
}

function partFieldValue(
  part: ClientContext,
  key: keyof typeof SHEET_FIELD_PRIORITY,
): string {
  const value = part[key]?.trim();
  if (!value || value === "—") return "";
  return value;
}

function pickSheetField(
  parts: ClientContext[],
  key: keyof typeof SHEET_FIELD_PRIORITY,
): AttributedField | null {
  for (const source of SHEET_FIELD_PRIORITY[key]) {
    const part = parts.find((entry) => entry.source === source);
    if (!part) continue;
    const value = partFieldValue(part, key);
    if (value) {
      return { label: FIELD_LABELS[key], value, source: partSourceLabel(part) };
    }
  }
  for (const part of parts) {
    const value = partFieldValue(part, key);
    if (value) {
      return { label: FIELD_LABELS[key], value, source: partSourceLabel(part) };
    }
  }
  return null;
}

export function collectSheetFieldConflict(
  parts: ClientContext[],
  key: keyof typeof SHEET_FIELD_PRIORITY,
): FieldConflict | null {
  const values: Array<{ source: DataSourceLabel; value: string }> = [];
  for (const part of parts) {
    const value = partFieldValue(part, key);
    if (!value) continue;
    const source = partSourceLabel(part);
    if (!values.some((entry) => entry.source === source && entry.value === value)) {
      values.push({ source, value });
    }
  }
  const distinct = [...new Set(values.map((entry) => entry.value))];
  if (distinct.length < 2) return null;
  return { field: FIELD_LABELS[key], values };
}

export function buildManagerSourceSummary(sources: DataSourceLabel[]): string {
  const unique = [...new Set(sources)];
  if (unique.length === 0) return "";
  if (unique.length === 1) {
    if (unique[0] === "CRM") return "Данные получены из CRM (таблица «Клиенты»).";
    if (unique[0] === "Formgrid") {
      return "Данные получены из анкеты Formgrid (новые клиенты).";
    }
    return "Данные получены из Emigrant Desk.";
  }
  const names = unique.map((source) => {
    if (source === "CRM") return "CRM";
    if (source === "Formgrid") return "Formgrid";
    return "Emigrant Desk";
  });
  if (names.length === 2) {
    return `Данные объединены из ${names[0]} и ${names[1]}.`;
  }
  return `Данные объединены из ${names.slice(0, -1).join(", ")} и ${names.at(-1)}.`;
}

export function buildContactSourceHint(fields: AttributedField[]): string {
  const formgridContacts = fields.filter(
    (field) =>
      (field.label === "Email" || field.label === "Телефон") &&
      field.source === "Formgrid",
  );
  if (formgridContacts.length > 0) {
    return "Контактные данные получены из анкеты Formgrid.";
  }
  const crmContacts = fields.filter(
    (field) =>
      (field.label === "Email" || field.label === "Телефон") &&
      field.source === "CRM",
  );
  if (crmContacts.length > 0) {
    return "Контактные данные получены из CRM.";
  }
  return "";
}

export function resolveClientContextAttribution(
  parts: ClientContext[],
  desk?: EmigrantDeskContextSlice | null,
): ClientContextAttribution {
  const fields: AttributedField[] = [];
  const conflicts: FieldConflict[] = [];

  for (const key of Object.keys(SHEET_FIELD_PRIORITY) as Array<
    keyof typeof SHEET_FIELD_PRIORITY
  >) {
    const conflict = collectSheetFieldConflict(parts, key);
    if (conflict) conflicts.push(conflict);
    const picked = pickSheetField(parts, key);
    if (picked) fields.push(picked);
  }

  const crmPart = parts.find((part) => part.source === "clients");
  if (crmPart) {
    const passport = extractPassportFromClientRecord(crmPart);
    if (passport.raw) {
      fields.push({
        label: "Паспорт",
        value: passport.raw,
        source: "CRM",
      });
    }
  }

  const formPart = parts.find((part) => part.source === "new_clients");
  if (formPart) {
    const passport = extractPassportFromClientRecord(formPart);
    if (passport.raw) {
      const existing = fields.find((field) => field.label === "Паспорт");
      if (!existing) {
        fields.push({
          label: "Паспорт",
          value: passport.raw,
          source: "Formgrid",
        });
      } else if (
        passport.normalized &&
        existing.value &&
        passport.normalized !== extractPassportFromClientRecord({ debugRow: { passport: existing.value } }).normalized
      ) {
        conflicts.push({
          field: "Паспорт",
          values: [
            { source: existing.source, value: existing.value },
            { source: "Formgrid", value: passport.raw },
          ],
        });
      }
    }
  }

  if (desk) {
    if (desk.caseNumber) {
      fields.push({
        label: "Номер дела",
        value: desk.caseNumber,
        source: "Emigrant Desk",
      });
    }
    if (desk.currentStatus) {
      const deskStatus = {
        label: "Статус дела (Desk)",
        value: desk.currentStatus,
        source: "Emigrant Desk" as const,
      };
      const crmStatus = fields.find((field) => field.label === "Статус");
      if (crmStatus && crmStatus.value !== desk.currentStatus) {
        conflicts.push({
          field: "Статус",
          values: [
            { source: crmStatus.source, value: crmStatus.value },
            { source: "Emigrant Desk", value: desk.currentStatus },
          ],
        });
      }
      fields.push(deskStatus);
    }
    if (desk.email) {
      const existing = fields.find((field) => field.label === "Email");
      if (!existing) {
        fields.push({ label: "Email", value: desk.email, source: "Emigrant Desk" });
      }
    }
    if (desk.consulate) {
      fields.push({
        label: "Консульство",
        value: desk.consulate,
        source: "Emigrant Desk",
      });
    }
    if (desk.submissionCity) {
      fields.push({
        label: "Город подачи",
        value: desk.submissionCity,
        source: "Emigrant Desk",
      });
    }
    if (desk.submissionDate) {
      fields.push({
        label: "Дата подачи",
        value: desk.submissionDate,
        source: "Emigrant Desk",
      });
    }
  }

  const activeSources: DataSourceLabel[] = [];
  if (parts.some((part) => part.source === "clients")) activeSources.push("CRM");
  if (parts.some((part) => part.source === "new_clients")) {
    activeSources.push("Formgrid");
  }
  if (desk) activeSources.push("Emigrant Desk");

  const contactHint = buildContactSourceHint(fields);
  const managerSummary = [buildManagerSourceSummary(activeSources), contactHint]
    .filter(Boolean)
    .join(" ");

  return {
    activeSources,
    fields,
    conflicts,
    managerSummary,
  };
}

export function formatSourceChecklist(sources: DataSourceLabel[]): string[] {
  const order: DataSourceLabel[] = ["CRM", "Formgrid", "Emigrant Desk"];
  return order.map((source) => {
    const active = sources.includes(source);
    return `${active ? "✅" : "⬜"} ${source}`;
  });
}

export function formatAttributedField(field: AttributedField): string {
  return [`${field.label}:`, field.value, `Источник: ${field.source}`].join("\n");
}

export function formatFieldConflicts(conflicts: FieldConflict[]): string[] {
  if (conflicts.length === 0) return [];
  const lines = ["Конфликт данных:"];
  for (const conflict of conflicts) {
    lines.push("", `${conflict.field}:`);
    for (const entry of conflict.values) {
      lines.push(`${entry.source}:`, entry.value);
    }
  }
  return lines;
}

export function formatPartsTechnicalBlocks(
  parts: ClientContext[],
  crmData: string,
  surveyData: string,
  desk?: EmigrantDeskContextSlice | null,
): string[] {
  const lines: string[] = ["--- Технические блоки по источникам ---"];

  const crmPart = parts.find((part) => part.source === "clients");
  const formPart = parts.find((part) => part.source === "new_clients");

  if (crmPart) {
    lines.push(
      "",
      `CRM (строка ${crmPart.rowIndex}):`,
      crmPart.surveyData || crmData || "(нет дополнительных полей)",
    );
  }

  if (formPart?.surveyData || surveyData) {
    lines.push(
      "",
      `Formgrid (строка ${formPart?.rowIndex ?? "?"}):`,
      formPart?.surveyData ?? surveyData,
    );
  }

  if (desk) {
    lines.push(
      "",
      "Emigrant Desk:",
      [
        desk.name && `ФИО: ${desk.name}`,
        desk.email && `Email: ${desk.email}`,
        desk.caseNumber && `№ дела: ${desk.caseNumber}`,
        desk.currentStatus && `Статус дела: ${desk.currentStatus}`,
        desk.consulate && `Консульство: ${desk.consulate}`,
        desk.submissionCity && `Город подачи: ${desk.submissionCity}`,
        desk.submissionDate && `Дата подачи: ${desk.submissionDate}`,
        desk.statusUpdatedAt &&
          `Статус обновлён: ${desk.statusUpdatedAt.slice(0, 10)}`,
        desk.internalComment && `Комментарий: ${desk.internalComment}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return lines;
}

export type FormatClientContextOptions = {
  desk?: EmigrantDeskContextSlice | null;
};

export function formatSingleClientContextWithSources(
  client: ClientContext,
  desk?: EmigrantDeskContextSlice | null,
): string {
  const source = partSourceLabel(client);
  const attribution = resolveClientContextAttribution([client], desk);

  const lines = [
    `Клиент: ${client.name}`,
    "",
    "Источники данных:",
    ...formatSourceChecklist(attribution.activeSources),
    "",
    `Сводка для ответа менеджеру: ${attribution.managerSummary}`,
    "",
    `Строка таблицы (${source}): ${client.rowIndex}`,
    "",
    ...attribution.fields.flatMap((field) => ["", formatAttributedField(field)]),
    ...formatFieldConflicts(attribution.conflicts).map((line) =>
      line === "" ? "" : line,
    ),
  ];

  if (client.surveyData) {
    lines.push("", "--- Технический блок ---", client.surveyData);
  }

  return lines.filter((line, index, array) => !(line === "" && array[index - 1] === "")).join("\n");
}

export function formatMergedClientContextWithSources(
  merged: MergedClientContext,
  desk?: EmigrantDeskContextSlice | null,
): string {
  const attribution = resolveClientContextAttribution(merged.parts, desk);
  const allConflicts = [
    ...attribution.conflicts,
    ...merged.conflicts.map((conflict) => ({
      field: conflict.field,
      values: conflict.values.map((entry) => ({
        source: entry.source as DataSourceLabel,
        value: entry.value,
      })),
    })),
  ];
  const conflictFields = new Set<string>();
  const dedupedConflicts = allConflicts.filter((conflict) => {
    if (conflictFields.has(conflict.field)) return false;
    conflictFields.add(conflict.field);
    return true;
  });

  const partLines = merged.parts.map(
    (part) =>
      `${partSourceLabel(part)} (${part.sourceLabel}, строка ${part.rowIndex})`,
  );

  const lines = [
    `Клиент: ${merged.name}`,
    "",
    "Источники данных:",
    ...formatSourceChecklist(attribution.activeSources),
    ...partLines.map((line) => `  · ${line}`),
    "",
    `Сводка для ответа менеджеру: ${attribution.managerSummary}`,
    merged.mergeReasons.length > 0
      ? `Объединено по: ${merged.mergeReasons.join(", ")}`
      : "",
    "",
    ...attribution.fields.flatMap((field) => [formatAttributedField(field), ""]),
    ...formatFieldConflicts(dedupedConflicts),
    ...formatPartsTechnicalBlocks(
      merged.parts,
      merged.crmData,
      merged.surveyData,
      desk,
    ),
  ];

  return lines.filter((line, index, array) => !(line === "" && array[index - 1] === "")).join("\n");
}
