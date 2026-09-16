/**
 * Structured case memory for AI Workspace chats.
 * Separate from free-text dialogue summary and from CRM CLIENT CONTEXT.
 */

export const WORKSPACE_CASE_MEMORY_EVERY_TURNS = 4;
export const WORKSPACE_CASE_MEMORY_MIN_TURNS = 2;
export const WORKSPACE_CASE_MEMORY_SOURCE_TURN_CAP = 24;

/** Sentinel: client-bound draft cleared on explicit switch — block transform. */
export const CLIENT_BOUND_DRAFT_CLEARED = "__cleared__";

export type WorkspaceCaseMemory = {
  clientName: string | null;
  citizenship: string | null;
  passport: string | null;
  /** Куда подаётся / виза / направление. */
  applicationPlace: string | null;
  /** Были ли ВНЖ / ВНЖ других стран. */
  priorResidency: string | null;
  employers: string | null;
  dates: string | null;
  specialNotes: string | null;
  openQuestions: string | null;
  linkedClientId: string | null;
  /**
   * Client UUID for the active transformable client-bound draft, or
   * CLIENT_BOUND_DRAFT_CLEARED after an explicit switch. null = legacy/unset.
   */
  draftClientId: string | null;
  updatedAt: string;
};

export type CaseMemoryClientSnapshot = {
  id?: string | null;
  name?: string | null;
  citizenship?: string | null;
  passportNumber?: string | null;
  country?: string | null;
  direction?: string | null;
  bookingAddress?: string | null;
  bookingRange?: string | null;
  submittedAt?: string | null;
  approvalAt?: string | null;
  notes?: string | null;
};

const STRING_FIELDS = [
  "clientName",
  "citizenship",
  "passport",
  "applicationPlace",
  "priorResidency",
  "employers",
  "dates",
  "specialNotes",
  "openQuestions",
  "linkedClientId",
  "draftClientId",
] as const;

function cleanField(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—" || /^не указано$/i.test(trimmed)) return null;
  return trimmed.slice(0, max);
}

export function emptyCaseMemory(
  updatedAt: string = new Date().toISOString(),
): WorkspaceCaseMemory {
  return {
    clientName: null,
    citizenship: null,
    passport: null,
    applicationPlace: null,
    priorResidency: null,
    employers: null,
    dates: null,
    specialNotes: null,
    openQuestions: null,
    linkedClientId: null,
    draftClientId: null,
    updatedAt,
  };
}

/** True when follow-up transform may rewrite the prior client-bound draft. */
export function isClientBoundDraftTransformAllowed(
  memory: WorkspaceCaseMemory | null | undefined,
): boolean {
  const sanitized = sanitizeCaseMemory(memory);
  if (!sanitized) return true; // no memory → legacy allow
  const draftId = sanitized.draftClientId;
  if (draftId == null) return true; // unset → legacy allow
  if (draftId === CLIENT_BOUND_DRAFT_CLEARED) return false;
  const linked = sanitized.linkedClientId;
  return Boolean(linked && draftId === linked);
}

/**
 * Current-request prepare lock wins over stale durable/store memory.
 * Never restore an older linkedClientId after an explicit switch this turn.
 */
export function selectAuthoritativeCaseMemory(params: {
  prepared: WorkspaceCaseMemory | null | undefined;
  refreshed: WorkspaceCaseMemory | null | undefined;
}): WorkspaceCaseMemory | null {
  const prep = sanitizeCaseMemory(params.prepared);
  const refreshed = sanitizeCaseMemory(params.refreshed);
  if (!prep) return refreshed;
  if (!refreshed) return prep;
  if (
    prep.linkedClientId &&
    refreshed.linkedClientId &&
    prep.linkedClientId !== refreshed.linkedClientId
  ) {
    return prep;
  }
  // Same identity (or one side missing id): patch=prepared wins conflicts.
  const merged = mergeCaseMemory(refreshed, prep);
  if (!merged) return prep;
  return {
    ...merged,
    linkedClientId: prep.linkedClientId ?? merged.linkedClientId,
    clientName: prep.clientName ?? merged.clientName,
    draftClientId: prep.draftClientId ?? merged.draftClientId,
    passport: null,
    updatedAt: prep.updatedAt || merged.updatedAt,
  };
}

export function sanitizeCaseMemory(value: unknown): WorkspaceCaseMemory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const next = emptyCaseMemory(
    typeof row.updatedAt === "string" && row.updatedAt.trim()
      ? row.updatedAt.trim()
      : new Date().toISOString(),
  );
  let hasAny = false;
  for (const key of STRING_FIELDS) {
    const cleaned = cleanField(row[key]);
    next[key] = cleaned;
    if (cleaned) hasAny = true;
  }
  return hasAny ? next : null;
}

/**
 * SSE/UI ownership for caseMemory on a single response:
 * - key absent → no change
 * - non-null → set (authoritative lock)
 * - null → do not wipe an already-received non-null lock in the same stream
 *   (early meta must omit the key; explicit clear is a separate unlock path)
 */
export function mergeStreamCaseMemoryUpdate(
  current: WorkspaceCaseMemory | null | undefined,
  incoming: WorkspaceCaseMemory | null | undefined,
  keyPresent: boolean,
): WorkspaceCaseMemory | null | undefined {
  if (!keyPresent) return current;
  if (incoming != null) return incoming;
  if (current != null) return current;
  return null;
}

export function caseMemoryHasFacts(
  memory: WorkspaceCaseMemory | null | undefined,
): boolean {
  if (!memory) return false;
  return STRING_FIELDS.some((key) => Boolean(memory[key]));
}

export function shouldRefreshCaseMemory(
  totalMessageCount: number,
  caseMemoryThroughMessageCount: number,
): boolean {
  if (totalMessageCount < WORKSPACE_CASE_MEMORY_MIN_TURNS) return false;
  const covered = Math.max(0, caseMemoryThroughMessageCount);
  return totalMessageCount - covered >= WORKSPACE_CASE_MEMORY_EVERY_TURNS;
}

export function mergeCaseMemory(
  base: WorkspaceCaseMemory | null | undefined,
  patch: WorkspaceCaseMemory | null | undefined,
): WorkspaceCaseMemory | null {
  if (!base && !patch) return null;
  const next = emptyCaseMemory(patch?.updatedAt ?? base?.updatedAt);
  let hasAny = false;
  for (const key of STRING_FIELDS) {
    const value = cleanField(patch?.[key]) ?? cleanField(base?.[key]);
    next[key] = value;
    if (value) hasAny = true;
  }
  return hasAny ? next : null;
}

/** Prefer non-empty CRM/sheet fields without inventing dialogue facts. */
export function mergeCaseMemoryFromClientSnapshot(
  base: WorkspaceCaseMemory | null | undefined,
  client: CaseMemoryClientSnapshot | null | undefined,
): WorkspaceCaseMemory | null {
  if (!client) return sanitizeCaseMemory(base);
  const fromClient = emptyCaseMemory();
  fromClient.linkedClientId = cleanField(client.id, 120);
  fromClient.clientName = cleanField(client.name, 200);
  fromClient.citizenship = cleanField(client.citizenship, 200);
  // Security Gate 1: do not persist passport in conversational case memory.
  fromClient.passport = null;
  fromClient.applicationPlace =
    cleanField(client.direction, 200) ?? cleanField(client.country, 200);
  const dateBits = [
    client.submittedAt ? `подача: ${client.submittedAt}` : null,
    client.approvalAt ? `одобрение: ${client.approvalAt}` : null,
    client.bookingRange ? `букинг: ${client.bookingRange}` : null,
  ].filter(Boolean);
  fromClient.dates = dateBits.length > 0 ? dateBits.join("; ") : null;
  // Do not persist booking/home address into employers (high-sensitivity).
  fromClient.employers = null;
  fromClient.specialNotes = cleanField(client.notes, 800);
  const baseSan = sanitizeCaseMemory(base);
  // Different canonical client → identity boundary; do not keep old client facts.
  if (
    fromClient.linkedClientId &&
    baseSan?.linkedClientId &&
    fromClient.linkedClientId !== baseSan.linkedClientId
  ) {
    return {
      ...fromClient,
      draftClientId: CLIENT_BOUND_DRAFT_CLEARED,
      passport: null,
      updatedAt: new Date().toISOString(),
    };
  }
  // Same client (or no prior lock): dialogue wins on conflicts; CRM fills empties.
  const merged = mergeCaseMemory(fromClient, base);
  if (!merged) return null;
  return {
    ...merged,
    linkedClientId: fromClient.linkedClientId ?? merged.linkedClientId,
    clientName:
      // Prefer existing dialogue name only when lock id matches / unset.
      (baseSan?.linkedClientId == null ||
      baseSan.linkedClientId === fromClient.linkedClientId
        ? merged.clientName
        : fromClient.clientName) ?? fromClient.clientName,
    passport: null,
  };
}

export function formatCaseMemoryForPrompt(
  memory: WorkspaceCaseMemory | null | undefined,
  options?: { includePassport?: boolean },
): string {
  const sanitized = sanitizeCaseMemory(memory);
  if (!sanitized) return "";
  // Security Gate 1: legacy stored passport must not enter model context by default.
  const includePassport = Boolean(options?.includePassport);
  const lines = [
    `Клиент: ${sanitized.clientName ?? "не указано"}`,
    `Гражданство: ${sanitized.citizenship ?? "не указано"}`,
    includePassport
      ? `Паспорт: ${sanitized.passport ?? "не указано"}`
      : null,
    `Куда подаётся / виза: ${sanitized.applicationPlace ?? "не указано"}`,
    `ВНЖ других стран: ${sanitized.priorResidency ?? "не указано"}`,
    `Работодатели / адреса: ${sanitized.employers ?? "не указано"}`,
    `Даты: ${sanitized.dates ?? "не указано"}`,
    `Особые комментарии / запреты: ${sanitized.specialNotes ?? "не указано"}`,
    `Открытые вопросы: ${sanitized.openQuestions ?? "не указано"}`,
  ].filter((line): line is string => Boolean(line));
  if (sanitized.linkedClientId) {
    lines.push(`Linked client id: ${sanitized.linkedClientId}`);
  }
  return [
    "=== ПАМЯТЬ КЕЙСА (структурированная) ===",
    "Это накопленные факты текущего диалога. При конфликте с CLIENT CONTEXT / authoritative-блоками приоритет у них; факты только из диалога оставляй.",
    "Паспорт и высокочувствительные поля не хранятся/не подставляются из памяти по умолчанию — запрашивай актуальные данные через инструменты при необходимости.",
    ...lines,
  ].join("\n");
}

/** Strip high-sensitivity fields before any model-bound use of stored memory. */
export function prepareCaseMemoryForModelContext(
  memory: WorkspaceCaseMemory | null | undefined,
): WorkspaceCaseMemory | null {
  const sanitized = sanitizeCaseMemory(memory);
  if (!sanitized) return null;
  return {
    ...sanitized,
    passport: null,
  };
}

export function buildCaseMemoryExtractPrompt(params: {
  previous: WorkspaceCaseMemory | null;
  turns: Array<{ role: string; content: string }>;
}): string {
  const previousJson = params.previous
    ? JSON.stringify(params.previous, null, 2)
    : "null";
  const transcript = params.turns
    .slice(-WORKSPACE_CASE_MEMORY_SOURCE_TURN_CAP)
    .map((turn) => {
      const role = turn.role === "assistant" ? "Ассистент" : "Менеджер";
      return `${role}: ${turn.content.trim().slice(0, 1000)}`;
    })
    .join("\n\n");

  return [
    "Обнови JSON-память кейса по диалогу. Верни ТОЛЬКО JSON-объект без markdown.",
    "Схема:",
    JSON.stringify(
      {
        clientName: "string|null",
        citizenship: "string|null",
        passport: "string|null",
        applicationPlace: "string|null",
        priorResidency: "string|null",
        employers: "string|null",
        dates: "string|null",
        specialNotes: "string|null",
        openQuestions: "string|null",
        linkedClientId: "string|null",
        draftClientId: "string|null",
      },
      null,
      2,
    ),
    "Правила: не выдумывай; сохраняй прежние факты, если новые их не опровергают; не включай пароли/секреты/appPassword; не сохраняй номер паспорта (passport всегда null).",
    `Текущая память:\n${previousJson}`,
    "",
    "Диалог:",
    transcript || "(пусто)",
  ].join("\n");
}

export function parseCaseMemoryFromModelText(
  raw: string | null | undefined,
): WorkspaceCaseMemory | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
    const sanitized = sanitizeCaseMemory({
      ...(typeof parsed === "object" && parsed && !Array.isArray(parsed)
        ? parsed
        : {}),
      updatedAt: new Date().toISOString(),
    });
    if (!sanitized) return null;
    return { ...sanitized, passport: null };
  } catch {
    return null;
  }
}
