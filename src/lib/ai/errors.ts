/**
 * Typed AI failure classification + user-safe Russian messages (Phase 0).
 * Never expose prompts, stacks, provider bodies, or secrets to the user.
 */

export class AiCompletionError extends Error {
  code: string;
  constructor(code = "AI_REQUEST_FAILED") {
    super(code);
    this.name = "AiCompletionError";
    this.code = code;
  }
}

/** Internal failure taxonomy for Workspace AI / OpenRouter. */
export type AiFailureClass =
  | "CLIENT_NOT_FOUND"
  | "CLIENT_AMBIGUOUS"
  | "DATA_NOT_AVAILABLE"
  | "SOURCE_UNAVAILABLE"
  | "MODEL_PROVIDER_ERROR"
  | "MODEL_RATE_LIMIT"
  | "MODEL_TIMEOUT"
  | "EMPTY_MODEL_RESPONSE"
  | "STREAM_INTERRUPTED"
  | "TOOL_ERROR"
  | "CONTEXT_LIMIT"
  | "INTERNAL_AI_ERROR"
  | "AI_CANCELLED"
  | "AI_NOT_CONFIGURED"
  | "MODEL_CONTENT_FILTER";

const FAILURE_CLASS_SET = new Set<string>([
  "CLIENT_NOT_FOUND",
  "CLIENT_AMBIGUOUS",
  "DATA_NOT_AVAILABLE",
  "SOURCE_UNAVAILABLE",
  "MODEL_PROVIDER_ERROR",
  "MODEL_RATE_LIMIT",
  "MODEL_TIMEOUT",
  "EMPTY_MODEL_RESPONSE",
  "STREAM_INTERRUPTED",
  "TOOL_ERROR",
  "CONTEXT_LIMIT",
  "INTERNAL_AI_ERROR",
  "AI_CANCELLED",
  "AI_NOT_CONFIGURED",
  "MODEL_CONTENT_FILTER",
]);

/** Normalize raw provider / legacy codes into stable internal codes. */
export function normalizeAiErrorCode(raw: string | null | undefined): string {
  const code = (raw ?? "AI_REQUEST_FAILED").trim();
  if (!code) return "AI_REQUEST_FAILED";

  if (FAILURE_CLASS_SET.has(code)) return code;

  if (code === "AI_TIMEOUT") return "MODEL_TIMEOUT";
  if (code === "MODEL_EMPTY_RESPONSE") return "EMPTY_MODEL_RESPONSE";
  if (code === "MODEL_STREAM_INTERRUPTED") return "STREAM_INTERRUPTED";
  if (code === "MODEL_LENGTH_LIMIT") return "CONTEXT_LIMIT";
  if (code === "MODEL_INVALID_RESPONSE") return "MODEL_PROVIDER_ERROR";
  if (code === "AI_INVALID_CONFIG") return "AI_NOT_CONFIGURED";

  if (/HTTP_429$/.test(code) || code === "MODEL_RATE_LIMIT") {
    return "MODEL_RATE_LIMIT";
  }
  if (/HTTP_40[13]$/.test(code)) return "AI_NOT_CONFIGURED";
  if (/HTTP_5\d\d$/.test(code) || /HTTP_\d{3}$/.test(code)) {
    return "MODEL_PROVIDER_ERROR";
  }

  if (code.startsWith("TOOL_") || code === "TOOL_ERROR") return "TOOL_ERROR";
  if (code === "SOURCE_UNAVAILABLE" || code.endsWith("_SOURCE_UNAVAILABLE")) {
    return "SOURCE_UNAVAILABLE";
  }

  return code;
}

/**
 * Map HTTP status from OpenRouter/OpenAI-compatible providers to internal code.
 * Privacy-safe: no response body.
 */
export function providerHttpErrorCode(
  provider: string,
  status: number,
): string {
  if (status === 429) return "MODEL_RATE_LIMIT";
  if (status === 401 || status === 403) return "AI_NOT_CONFIGURED";
  if (status >= 500 && status <= 599) return "MODEL_PROVIDER_ERROR";
  // Preserve provider-tagged code for rare 4xx; classify still maps to provider error.
  const tag = provider.trim().toUpperCase() || "PROVIDER";
  return `${tag}_HTTP_${status}`;
}

export function classifyAiFailure(code: string): AiFailureClass {
  const normalized = normalizeAiErrorCode(code);

  if (FAILURE_CLASS_SET.has(normalized)) {
    return normalized as AiFailureClass;
  }

  if (normalized === "AI_CANCELLED") return "AI_CANCELLED";
  if (normalized === "MODEL_CONTENT_FILTER") return "MODEL_CONTENT_FILTER";
  if (normalized === "CONTEXT_LIMIT") return "CONTEXT_LIMIT";
  if (normalized === "EMPTY_MODEL_RESPONSE") return "EMPTY_MODEL_RESPONSE";
  if (normalized === "STREAM_INTERRUPTED") return "STREAM_INTERRUPTED";
  if (normalized === "MODEL_TIMEOUT") return "MODEL_TIMEOUT";
  if (normalized === "MODEL_RATE_LIMIT") return "MODEL_RATE_LIMIT";
  if (normalized === "AI_NOT_CONFIGURED") return "AI_NOT_CONFIGURED";
  if (normalized === "TOOL_ERROR") return "TOOL_ERROR";
  if (normalized === "CLIENT_NOT_FOUND") return "CLIENT_NOT_FOUND";
  if (normalized === "CLIENT_AMBIGUOUS") return "CLIENT_AMBIGUOUS";
  if (normalized === "DATA_NOT_AVAILABLE") return "DATA_NOT_AVAILABLE";
  if (normalized === "SOURCE_UNAVAILABLE") return "SOURCE_UNAVAILABLE";

  if (/HTTP_429$/.test(normalized)) return "MODEL_RATE_LIMIT";
  if (/HTTP_40[13]$/.test(normalized)) return "AI_NOT_CONFIGURED";
  if (/HTTP_\d{3}$/.test(normalized)) return "MODEL_PROVIDER_ERROR";

  if (
    normalized.includes("TOOL") ||
    normalized === "AGENT_LOOP_FAILED" ||
    normalized === "AGENT_NO_ANSWER"
  ) {
    return "TOOL_ERROR";
  }

  return "INTERNAL_AI_ERROR";
}

export function aiErrorCode(error: unknown): string {
  if (error instanceof AiCompletionError) {
    return normalizeAiErrorCode(error.code);
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return "MODEL_TIMEOUT";
  }
  if (error instanceof Error && error.name === "AbortError") {
    return "AI_CANCELLED";
  }
  return "INTERNAL_AI_ERROR";
}

const USER_MESSAGES: Record<AiFailureClass, string> = {
  CLIENT_NOT_FOUND:
    "Клиент не найден в заявках портала Emigrant. Уточните ФИО или другой идентификатор.",
  CLIENT_AMBIGUOUS:
    "Найдено несколько клиентов. Уточните, кого именно вы имеете в виду.",
  DATA_NOT_AVAILABLE:
    "В доступных данных платформы это поле не заполнено.",
  SOURCE_UNAVAILABLE:
    "Источник данных временно недоступен. Это не значит, что сведений нет — повторите запрос позже.",
  MODEL_PROVIDER_ERROR:
    "Сервис AI не смог завершить ответ. Повторите запрос позже.",
  MODEL_RATE_LIMIT:
    "Сервис AI временно ограничил запросы. Повторите позже.",
  MODEL_TIMEOUT:
    "Время ожидания AI истекло. Ответ не завершён. Повторите запрос.",
  EMPTY_MODEL_RESPONSE:
    "AI вернул пустой ответ. Повторите запрос — это технический сбой, а не отсутствие данных о клиенте.",
  STREAM_INTERRUPTED:
    "Ответ AI получен не полностью. Повторите запрос.",
  TOOL_ERROR:
    "Не удалось получить данные через инструменты AI. Повторите запрос позже.",
  CONTEXT_LIMIT:
    "Ответ не завершён: достигнут лимит длины. Попросите ответить короче или разбейте вопрос на части.",
  INTERNAL_AI_ERROR:
    "Не удалось получить ответ AI. Повторите запрос позже.",
  AI_CANCELLED: "Генерация остановлена. Ответ не завершён.",
  AI_NOT_CONFIGURED:
    "AI недоступен из-за настроек подключения. Обратитесь к администратору.",
  MODEL_CONTENT_FILTER:
    "AI не смог завершить ответ из-за ограничения обработки содержимого. Попробуйте переформулировать вопрос.",
};

export function aiErrorMessage(code: string): string {
  const failureClass = classifyAiFailure(code);
  return USER_MESSAGES[failureClass];
}

export function aiErrorStatus(code: string): number {
  const failureClass = classifyAiFailure(code);
  if (failureClass === "MODEL_TIMEOUT") return 504;
  if (failureClass === "AI_CANCELLED") return 499;
  if (failureClass === "MODEL_RATE_LIMIT") return 429;
  if (failureClass === "AI_NOT_CONFIGURED") return 503;
  if (
    failureClass === "CLIENT_NOT_FOUND" ||
    failureClass === "CLIENT_AMBIGUOUS" ||
    failureClass === "DATA_NOT_AVAILABLE"
  ) {
    return 200;
  }
  return 502;
}

/** Privacy-safe fields for SSE / JSON error payloads. */
export function aiErrorPayload(code: string): {
  code: string;
  failureClass: AiFailureClass;
  message: string;
} {
  const normalized = normalizeAiErrorCode(code);
  const failureClass = classifyAiFailure(normalized);
  return {
    code: normalized,
    failureClass,
    message: aiErrorMessage(normalized),
  };
}
