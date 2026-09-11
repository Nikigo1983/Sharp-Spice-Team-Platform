/**
 * Tool security: denylist, redaction, untrusted wrapping.
 */

import {
  isSensitiveFieldKey,
  redactSensitiveText,
  REDACTED_VALUE,
} from "@/lib/ai/context-redaction";
import { wrapUntrustedSourceData } from "@/lib/ai/answer-grounding";

const SENSITIVE_KEY_PATTERN =
  /password|token|secret|credential|auth|appPassword|api[_-]?key/i;

/** Fields never returned from client tools. */
export const CLIENT_TOOL_DENYLIST = new Set([
  "appPassword",
  "password",
  "пароль",
  "token",
  "secret",
  "credential",
  "accessToken",
  "refreshToken",
  "apiKey",
  "debugRow",
]);

export function isDeniedClientFieldKey(key: string): boolean {
  if (CLIENT_TOOL_DENYLIST.has(key)) return true;
  if (isSensitiveFieldKey(key)) return true;
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function deepRedactToolPayload(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => deepRedactToolPayload(entry));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (isDeniedClientFieldKey(key)) {
        out[key] = REDACTED_VALUE;
        continue;
      }
      out[key] = deepRedactToolPayload(entry);
    }
    return out;
  }
  return value;
}

export function wrapKbSnippetAsUntrusted(params: {
  documentId: string;
  title: string;
  snippet: string;
}): string {
  return wrapUntrustedSourceData({
    refId: `KB:${params.documentId}`,
    kind: "knowledge_base",
    title: params.title,
    body: params.snippet,
    contentRetrieved: Boolean(params.snippet.trim()),
  });
}

/** Strip auth-like keys Astra might try to inject into args (ignored). */
export const FORBIDDEN_TOOL_ARG_KEYS = new Set([
  "userId",
  "tenantId",
  "role",
  "permissions",
  "sessionId",
  "authToken",
  "apiKey",
]);

export function stripForbiddenAuthArgs(
  raw: unknown,
): { cleaned: unknown; rejectedAuthFields: string[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { cleaned: raw, rejectedAuthFields: [] };
  }
  const rejectedAuthFields: string[] = [];
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (FORBIDDEN_TOOL_ARG_KEYS.has(key)) {
      rejectedAuthFields.push(key);
      continue;
    }
    cleaned[key] = value;
  }
  return { cleaned, rejectedAuthFields };
}

export function truncateChars(text: string, max: number): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max)}…`, truncated: true };
}
