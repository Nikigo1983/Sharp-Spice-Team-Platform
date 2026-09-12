export class AiCompletionError extends Error {
  code: string;
  constructor(code = "AI_REQUEST_FAILED") {
    super(code);
    this.name = "AiCompletionError";
    this.code = code;
  }
}

export function aiErrorCode(error: unknown): string {
  if (error instanceof AiCompletionError) return error.code;
  if (error instanceof Error && error.name === "TimeoutError") return "AI_TIMEOUT";
  if (error instanceof Error && error.name === "AbortError") return "AI_CANCELLED";
  return "AI_REQUEST_FAILED";
}

export function aiErrorMessage(code: string): string {
  if (code === "AI_CANCELLED") return "Генерация остановлена. Ответ не завершён.";
  if (code === "AI_TIMEOUT") return "Время ожидания AI истекло. Ответ не завершён. Повторите запрос.";
  if (code === "MODEL_LENGTH_LIMIT") return "Ответ не завершён: достигнут лимит длины. Попросите ответить короче или разбейте вопрос на части.";
  if (code === "MODEL_CONTENT_FILTER") return "AI не смог завершить ответ из-за ограничения обработки содержимого. Попробуйте переформулировать вопрос.";
  if (code === "MODEL_STREAM_INTERRUPTED" || code === "MODEL_INVALID_RESPONSE") return "Ответ AI получен не полностью. Повторите запрос.";
  if (code === "AI_NOT_CONFIGURED" || code === "AI_INVALID_CONFIG" || /HTTP_40[13]$/.test(code)) return "AI недоступен из-за настроек подключения. Обратитесь к администратору.";
  if (/HTTP_429$/.test(code)) return "Сервис AI временно ограничил запросы. Повторите позже.";
  return "Не удалось получить ответ AI. Повторите запрос позже.";
}

export function aiErrorStatus(code: string): number {
  if (code === "AI_TIMEOUT") return 504;
  if (code === "AI_CANCELLED") return 499;
  if (/HTTP_429$/.test(code)) return 429;
  if (code === "AI_NOT_CONFIGURED" || code === "AI_INVALID_CONFIG") return 503;
  return 502;
}
