/**
 * Deterministic "data for document fill" pack for AI Workspace.
 * Builds a reviewable field table from CLIENT CONTEXT + case memory.
 * Does not generate DOCX/PDF — only grounded values + gaps.
 */

import type { ResolvedClientContext } from "@/lib/ai/client-context";
import { isMergedClientContext } from "@/lib/ai/client-context";
import {
  caseMemoryHasFacts,
  type WorkspaceCaseMemory,
} from "@/lib/ai/workspace-case-memory";

export type DocFillFieldId =
  | "fullName"
  | "latinName"
  | "citizenship"
  | "passport"
  | "email"
  | "phone"
  | "direction"
  | "applicationPlace"
  | "priorResidency"
  | "bookingAddress"
  | "bookingRange"
  | "submittedAt"
  | "approvalAt"
  | "employers"
  | "partner"
  | "specialNotes"
  | "openQuestions";

export type DocFillField = {
  id: DocFillFieldId;
  label: string;
  value: string | null;
  source: string | null;
  required: boolean;
};

export type DocFillPack = {
  documentLabel: string;
  clientName: string | null;
  fields: DocFillField[];
  filledCount: number;
  missingRequired: DocFillField[];
  missingOptional: DocFillField[];
};

const FILL_INTENT_RE =
  /заполн\w*|данные\s+для\s+заполн|собери\s+данн\w*\s+для|fill\s+(?:the\s+)?(?:form|document|application)|prepare\s+(?:form|application)\s+data|field\s+map|поля\s+для\s+(?:заявлен|анкет|документ)|для\s+заявлен\w*|для\s+анкет\w*|черновик\s+заполн/i;

const NOT_FILL_RE =
  /какие\s+документ|чеклист|checklist|сравни\s+требован|нужны\s+для\s+digital|requirements?\s+for/i;

export function isDocFillIntent(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed || NOT_FILL_RE.test(trimmed)) return false;
  return FILL_INTENT_RE.test(trimmed);
}

export function detectDocFillDocumentLabel(query: string): string {
  const lower = query.toLowerCase();
  if (/digital\s*nomad|диджитал\s*номад|цифров\w*\s+кочевн/i.test(lower)) {
    return "Digital Nomad / заявление";
  }
  if (/внж|residence|вид\s+на\s+жительств/i.test(lower)) {
    return "ВНЖ / residence";
  }
  if (/анкет/i.test(lower)) return "Анкета";
  if (/заявлен/i.test(lower)) return "Заявление";
  if (/договор/i.test(lower)) return "Договор";
  return "Документ / заявление";
}

function clean(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—" || /^не указано$/i.test(trimmed)) return null;
  return trimmed.slice(0, max);
}

function pickDebug(
  client: ResolvedClientContext,
  patterns: RegExp[],
): string | null {
  const entries = isMergedClientContext(client)
    ? client.parts.flatMap((part) => Object.entries(part.debugRow))
    : Object.entries(client.debugRow);
  for (const [key, value] of entries) {
    if (!value?.trim()) continue;
    if (patterns.some((pattern) => pattern.test(key))) {
      return clean(value);
    }
  }
  return null;
}

function sourceLabel(client: ResolvedClientContext): string {
  if (isMergedClientContext(client)) return "объединённый клиент";
  if (client.source === "new_clients") return "анкета Formgrid";
  return "таблица «Клиенты»";
}

type FieldSeed = {
  id: DocFillFieldId;
  label: string;
  required: boolean;
  fromClient: (client: ResolvedClientContext) => string | null;
  fromMemory: (memory: WorkspaceCaseMemory) => string | null;
};

const FIELD_SEEDS: FieldSeed[] = [
  {
    id: "fullName",
    label: "ФИО",
    required: true,
    fromClient: (c) => clean(c.name),
    fromMemory: (m) => clean(m.clientName),
  },
  {
    id: "latinName",
    label: "ФИО латиницей",
    required: true,
    fromClient: (c) =>
      pickDebug(c, [/^latinname$/i, /латиниц/i]) ??
      // CRM stores latin in citizenship column historically — only if looks latin.
      (() => {
        const latinish = pickDebug(c, [/^citizenship$/i, /гражданств/i]);
        if (latinish && /^[A-Za-z\s\-'.]+$/.test(latinish)) return latinish;
        return null;
      })(),
    fromMemory: () => null,
  },
  {
    id: "citizenship",
    label: "Гражданство",
    required: true,
    fromClient: (c) => {
      const raw = pickDebug(c, [/гражданств/i, /citizenship/i, /национальн/i]);
      if (raw && !/^[A-Za-z\s\-'.]+$/.test(raw)) return raw;
      // Prefer non-latin citizenship; latin-looking values are latinName.
      return pickDebug(c, [/гражданств/i, /национальн/i]);
    },
    fromMemory: (m) => clean(m.citizenship),
  },
  {
    id: "passport",
    label: "Паспорт",
    required: true,
    fromClient: (c) => pickDebug(c, [/^passport$/i, /паспорт/i]),
    fromMemory: (m) => clean(m.passport),
  },
  {
    id: "email",
    label: "Email",
    required: false,
    fromClient: (c) => clean(c.email) ?? pickDebug(c, [/^email$/i, /почт/i]),
    fromMemory: () => null,
  },
  {
    id: "phone",
    label: "Телефон",
    required: false,
    fromClient: (c) => clean(c.phone) ?? pickDebug(c, [/телефон|phone/i]),
    fromMemory: () => null,
  },
  {
    id: "direction",
    label: "Направление",
    required: false,
    fromClient: (c) => clean(c.direction) ?? clean(c.country),
    fromMemory: (m) => clean(m.applicationPlace),
  },
  {
    id: "applicationPlace",
    label: "Куда подаётся / виза",
    required: false,
    fromClient: (c) => clean(c.direction) ?? clean(c.country),
    fromMemory: (m) => clean(m.applicationPlace),
  },
  {
    id: "priorResidency",
    label: "ВНЖ других стран",
    required: false,
    fromClient: () => null,
    fromMemory: (m) => clean(m.priorResidency),
  },
  {
    id: "bookingAddress",
    label: "Адрес букинга / проживания",
    required: false,
    fromClient: (c) =>
      pickDebug(c, [/адрес\s*букинг|booking.*address|адрес\s*прожив/i]),
    fromMemory: () => null,
  },
  {
    id: "bookingRange",
    label: "Даты букинга",
    required: false,
    fromClient: (c) =>
      pickDebug(c, [/дата\s*букинг|booking.*date|booking.*range|даты\s*букинг/i]),
    fromMemory: (m) => clean(m.dates),
  },
  {
    id: "submittedAt",
    label: "Дата подачи",
    required: false,
    fromClient: (c) => pickDebug(c, [/дата\s*подач|submitted/i]),
    fromMemory: () => null,
  },
  {
    id: "approvalAt",
    label: "Дата одобрения",
    required: false,
    fromClient: (c) => pickDebug(c, [/одобрен|approval/i]),
    fromMemory: () => null,
  },
  {
    id: "employers",
    label: "Работодатели / адреса работы",
    required: false,
    fromClient: () => null,
    fromMemory: (m) => clean(m.employers),
  },
  {
    id: "partner",
    label: "Партнер / реферер",
    required: false,
    fromClient: (c) => pickDebug(c, [/^partner$/i, /партн/i]),
    fromMemory: () => null,
  },
  {
    id: "specialNotes",
    label: "Особые комментарии / запреты",
    required: false,
    fromClient: (c) => pickDebug(c, [/^notes$/i, /^заметк/i]),
    fromMemory: (m) => clean(m.specialNotes),
  },
  {
    id: "openQuestions",
    label: "Открытые вопросы",
    required: false,
    fromClient: () => null,
    fromMemory: (m) => clean(m.openQuestions),
  },
];

export function buildDocFillPack(params: {
  query: string;
  client: ResolvedClientContext | null;
  caseMemory?: WorkspaceCaseMemory | null;
}): DocFillPack {
  const documentLabel = detectDocFillDocumentLabel(params.query);
  const client = params.client;
  const memory =
    params.caseMemory && caseMemoryHasFacts(params.caseMemory)
      ? params.caseMemory
      : null;

  const fields: DocFillField[] = FIELD_SEEDS.map((seed) => {
    const fromClient = client ? seed.fromClient(client) : null;
    const fromMemory = memory ? seed.fromMemory(memory) : null;
    const memoryFirst = new Set<DocFillFieldId>([
      "priorResidency",
      "employers",
      "specialNotes",
      "openQuestions",
    ]);
    const preferMemory = memoryFirst.has(seed.id);
    const primary = preferMemory ? fromMemory : fromClient;
    const secondary = preferMemory ? fromClient : fromMemory;
    if (primary) {
      return {
        id: seed.id,
        label: seed.label,
        value: primary,
        source: preferMemory
          ? "память кейса"
          : client
            ? sourceLabel(client)
            : null,
        required: seed.required,
      };
    }
    if (secondary) {
      return {
        id: seed.id,
        label: seed.label,
        value: secondary,
        source: preferMemory
          ? client
            ? sourceLabel(client)
            : null
          : "память кейса",
        required: seed.required,
      };
    }
    return {
      id: seed.id,
      label: seed.label,
      value: null,
      source: null,
      required: seed.required,
    };
  });

  const filled = fields.filter((f) => Boolean(f.value));
  const missingRequired = fields.filter((f) => f.required && !f.value);
  const missingOptional = fields.filter((f) => !f.required && !f.value);

  return {
    documentLabel,
    clientName: client?.name ?? memory?.clientName ?? null,
    fields,
    filledCount: filled.length,
    missingRequired,
    missingOptional,
  };
}

export function formatDocFillReply(pack: DocFillPack): string {
  const who = pack.clientName ? ` для **${pack.clientName}**` : "";
  const lines: string[] = [
    `Данные для заполнения: **${pack.documentLabel}**${who}`,
    `Заполнено полей: ${pack.filledCount} из ${pack.fields.length}. Ничего не выдумано — только то, что есть в таблицах / памяти кейса.`,
    "",
    "**Поля**",
  ];

  for (const field of pack.fields) {
    if (!field.value) continue;
    lines.push(
      `- **${field.label}:** ${field.value}${field.source ? ` _(источник: ${field.source})_` : ""}`,
    );
  }

  if (pack.missingRequired.length > 0) {
    lines.push("", "**Обязательные пробелы (нужно уточнить)**");
    for (const field of pack.missingRequired) {
      lines.push(`- ${field.label}`);
    }
  }

  const notableOptional = pack.missingOptional.filter((f) =>
    ["priorResidency", "employers", "bookingAddress", "latinName", "email"].includes(
      f.id,
    ),
  );
  if (notableOptional.length > 0) {
    lines.push("", "**Желательно уточнить**");
    for (const field of notableOptional) {
      lines.push(`- ${field.label}`);
    }
  }

  lines.push(
    "",
    "**Дальше:** уточните пробелы у клиента или в диалоге — я обновлю память кейса и пересоберу пакет. Готовый DOCX/PDF пока не генерирую: это черновик полей для ручного заполнения.",
  );

  return lines.join("\n");
}

export function formatDocFillAskClientReply(): string {
  return [
    "Чтобы собрать данные для заполнения документа, укажите клиента (ФИО или паспорт).",
    "Пример: «Собери данные для заполнения заявления по Ивану Иванову».",
  ].join("\n");
}

/** Extra system/user guidance when fill intent goes through the LLM path. */
export function buildDocFillPromptAddon(pack: DocFillPack | null): string {
  if (!pack) {
    return [
      "=== РЕЖИМ ЗАПОЛНЕНИЯ ДОКУМЕНТА ===",
      "Менеджер просит данные для заполнения формы/заявления.",
      "Не выдумывай поля. Если клиента нет в контексте — попроси ФИО/паспорт.",
      "Формат: список полей со значением и источником + обязательные пробелы.",
    ].join("\n");
  }
  return [
    "=== РЕЖИМ ЗАПОЛНЕНИЯ ДОКУМЕНТА ===",
    "Ниже уже собран детерминированный пакет полей. Ответь по нему: не добавляй значений, которых нет.",
    `Документ: ${pack.documentLabel}`,
    formatDocFillReply(pack),
  ].join("\n\n");
}
