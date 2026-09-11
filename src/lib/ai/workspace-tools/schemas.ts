/**
 * Lightweight strict validators (no zod in repo).
 * Reject unknown fields, wrong types, oversized strings.
 */

import type { WorkspaceToolErrorCode } from "@/lib/ai/workspace-tools/types";

export type SchemaValidationFailure = {
  ok: false;
  errorCode: WorkspaceToolErrorCode;
  message: string;
};

export type SchemaValidationSuccess<T> = {
  ok: true;
  value: T;
};

export type SchemaValidationResult<T> =
  | SchemaValidationSuccess<T>
  | SchemaValidationFailure;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function reject(
  message: string,
  errorCode: WorkspaceToolErrorCode = "INVALID_ARGS",
): SchemaValidationFailure {
  return { ok: false, errorCode, message };
}

function readString(
  obj: Record<string, unknown>,
  key: string,
  opts: { required?: boolean; max: number; min?: number },
): SchemaValidationResult<string | undefined> {
  if (!(key in obj) || obj[key] === undefined || obj[key] === null) {
    if (opts.required) return reject(`Missing required field: ${key}`);
    return { ok: true, value: undefined };
  }
  if (typeof obj[key] !== "string") {
    return reject(`Field ${key} must be a string`);
  }
  const trimmed = obj[key].trim();
  if (opts.required && !trimmed) {
    return reject(`Field ${key} must be non-empty`);
  }
  const min = opts.min ?? 0;
  if (trimmed.length < min) {
    return reject(`Field ${key} is too short`);
  }
  if (trimmed.length > opts.max) {
    return reject(`Field ${key} exceeds max length ${opts.max}`);
  }
  return { ok: true, value: trimmed };
}

function readInteger(
  obj: Record<string, unknown>,
  key: string,
  opts: { required?: boolean; min: number; max: number; defaultValue?: number },
): SchemaValidationResult<number | undefined> {
  if (!(key in obj) || obj[key] === undefined || obj[key] === null) {
    if (opts.required) return reject(`Missing required field: ${key}`);
    return { ok: true, value: opts.defaultValue };
  }
  if (typeof obj[key] !== "number" || !Number.isInteger(obj[key])) {
    return reject(`Field ${key} must be an integer`);
  }
  const n = obj[key];
  if (n < opts.min || n > opts.max) {
    return reject(`Field ${key} must be between ${opts.min} and ${opts.max}`);
  }
  return { ok: true, value: n };
}

function assertOnlyKeys(
  obj: Record<string, unknown>,
  allowed: string[],
): SchemaValidationFailure | null {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      return reject(`Unknown field: ${key}`);
    }
  }
  return null;
}

export type SearchClientsArgs = {
  query: string;
  limit: number;
};

export function validateSearchClientsArgs(
  raw: unknown,
): SchemaValidationResult<SearchClientsArgs> {
  if (!isPlainObject(raw)) return reject("Arguments must be an object");
  const bad = assertOnlyKeys(raw, ["query", "limit"]);
  if (bad) return bad;
  const query = readString(raw, "query", { required: true, max: 200, min: 1 });
  if (!query.ok) return query;
  const limit = readInteger(raw, "limit", {
    min: 1,
    max: 10,
    defaultValue: 5,
  });
  if (!limit.ok) return limit;
  return {
    ok: true,
    value: { query: query.value!, limit: limit.value ?? 5 },
  };
}

export type GetClientArgs = {
  clientId: string;
};

export function validateGetClientArgs(
  raw: unknown,
): SchemaValidationResult<GetClientArgs> {
  if (!isPlainObject(raw)) return reject("Arguments must be an object");
  const bad = assertOnlyKeys(raw, ["clientId"]);
  if (bad) return bad;
  const clientId = readString(raw, "clientId", {
    required: true,
    max: 80,
    min: 1,
  });
  if (!clientId.ok) return clientId;
  return { ok: true, value: { clientId: clientId.value! } };
}

export type GetCaseContextArgs = {
  clientId: string;
};

export function validateGetCaseContextArgs(
  raw: unknown,
): SchemaValidationResult<GetCaseContextArgs> {
  return validateGetClientArgs(raw);
}

export type SearchKnowledgeBaseArgs = {
  query: string;
  limit: number;
  programHint?: string;
};

export function validateSearchKnowledgeBaseArgs(
  raw: unknown,
): SchemaValidationResult<SearchKnowledgeBaseArgs> {
  if (!isPlainObject(raw)) return reject("Arguments must be an object");
  const bad = assertOnlyKeys(raw, ["query", "limit", "programHint"]);
  if (bad) return bad;
  const query = readString(raw, "query", { required: true, max: 400, min: 1 });
  if (!query.ok) return query;
  const limit = readInteger(raw, "limit", {
    min: 1,
    max: 8,
    defaultValue: 5,
  });
  if (!limit.ok) return limit;
  const programHint = readString(raw, "programHint", { max: 120 });
  if (!programHint.ok) return programHint;
  return {
    ok: true,
    value: {
      query: query.value!,
      limit: limit.value ?? 5,
      programHint: programHint.value,
    },
  };
}

/** OpenAI-compatible tool parameter schemas for registry. */
export const SEARCH_CLIENTS_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: {
      type: "string",
      minLength: 1,
      maxLength: 200,
      description: "Client name, email, or passport fragment to search",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 10,
      description: "Max matches to return (default 5)",
    },
  },
} as const;

export const GET_CLIENT_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["clientId"],
  properties: {
    clientId: {
      type: "string",
      minLength: 1,
      maxLength: 80,
      description: "Canonical CRM client id from search_clients",
    },
  },
} as const;

export const GET_CASE_CONTEXT_PARAMETERS = GET_CLIENT_PARAMETERS;

export const SEARCH_KNOWLEDGE_BASE_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: {
      type: "string",
      minLength: 1,
      maxLength: 400,
      description: "Knowledge base search query",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 8,
      description: "Max ranked hits (default 5)",
    },
    programHint: {
      type: "string",
      maxLength: 120,
      description: "Optional program hint e.g. ВНЖ, digital nomad",
    },
  },
} as const;
