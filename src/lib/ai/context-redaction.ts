import type { ClientContext } from "@/lib/ai/client-context";

export type ProviderChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type RedactableChatTurn = {
  role: "user" | "assistant";
  content: string;
};

const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /^appPassword$/i,
  /app[_-]?password/i,
  /^password$/i,
  /пароль/i,
  /\bsecret\b/i,
  /\bapi[_-]?key\b/i,
  /\bauth[_-]?token\b/i,
  /\baccess[_-]?token\b/i,
  /\brefresh[_-]?token\b/i,
];

const SENSITIVE_JSON_VALUE_PATTERN =
  /"(appPassword|password|apiKey|secret|token|accessToken|refreshToken)"\s*:\s*"([^"\\]|\\.)*"/gi;

const SENSITIVE_INLINE_LABEL_PATTERN =
  /(пароль\s+для\s+приложения|app\s*password)\s*[:=]\s*[^\s|,\n]+/gi;

const SENSITIVE_BARE_KEY_VALUE_PATTERN =
  /\bappPassword\s*:\s*"([^"]+)"/gi;

export const REDACTED_VALUE = "[REDACTED]";

export function isSensitiveFieldKey(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) return false;
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function redactDebugRow(
  row: Record<string, string> | undefined | null,
): Record<string, string> {
  if (!row) return {};
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !isSensitiveFieldKey(key)),
  );
}

export function redactSensitiveText(text: string): string {
  if (!text) return text;
  return text
    .replace(SENSITIVE_JSON_VALUE_PATTERN, `"$1": "${REDACTED_VALUE}"`)
    .replace(SENSITIVE_BARE_KEY_VALUE_PATTERN, `appPassword: "${REDACTED_VALUE}"`)
    .replace(SENSITIVE_INLINE_LABEL_PATTERN, `$1: ${REDACTED_VALUE}`);
}

function hasUnredactedSensitiveValue(text: string): boolean {
  for (const match of text.matchAll(SENSITIVE_JSON_VALUE_PATTERN)) {
    if (!match[0].includes(`"${REDACTED_VALUE}"`)) return true;
  }
  for (const match of text.matchAll(SENSITIVE_BARE_KEY_VALUE_PATTERN)) {
    const value = match[1];
    if (value && value !== REDACTED_VALUE) return true;
  }
  for (const match of text.matchAll(SENSITIVE_INLINE_LABEL_PATTERN)) {
    if (!match[0].includes(REDACTED_VALUE)) return true;
  }
  return false;
}

export function containsSensitiveMarkers(text: string): boolean {
  if (!text) return false;
  return hasUnredactedSensitiveValue(text);
}

export function sanitizeClientContextForTransport(
  context: ClientContext,
): ClientContext {
  return {
    ...context,
    debugRow: redactDebugRow(context.debugRow),
    surveyData: context.surveyData
      ? redactSensitiveText(context.surveyData)
      : context.surveyData,
  };
}

export function sanitizeClientContextsForTransport(
  contexts: ClientContext[] | null | undefined,
): ClientContext[] | undefined {
  if (!contexts) return undefined;
  return contexts.map(sanitizeClientContextForTransport);
}

export function sanitizeChatMessagesForProvider<T extends ProviderChatMessage>(
  messages: T[],
): T[] {
  return messages.map((message) => ({
    ...message,
    content: redactSensitiveText(message.content),
  }));
}

export function sanitizeWorkspaceChatTurns<T extends RedactableChatTurn>(
  turns: T[],
): T[] {
  return turns.map((turn) => ({
    ...turn,
    content: redactSensitiveText(turn.content),
  }));
}

export function redactForLogging(value: unknown): unknown {
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactForLogging(entry));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const redacted: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      if (isSensitiveFieldKey(key)) {
        redacted[key] = REDACTED_VALUE;
      } else {
        redacted[key] = redactForLogging(entry);
      }
    }
    return redacted;
  }
  return value;
}

export function assertOpenRouterPayloadSafe(messages: ProviderChatMessage[]): void {
  for (const message of messages) {
    if (containsSensitiveMarkers(message.content)) {
      console.warn(
        `[ai/security] sensitive marker detected in ${message.role} message before OpenRouter — content redacted`,
      );
    }
  }
}
