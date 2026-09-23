import { createHmac, timingSafeEqual } from "node:crypto";
import type { CaseFileAccessClaims } from "./case-file-access-token";

/** Long enough for Word security prompt + download over slow networks. */
const DEFAULT_TTL_SEC = 600;

/**
 * Microsoft Word URI scheme rejects document URLs longer than ~256 chars on
 * many licensed installs (“Office doesn’t recognize the command”).
 */
export const WORD_URI_DOC_URL_MAX = 240;

function getAuthSecretKey(): Buffer {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) return Buffer.from(secret, "utf8");
  if (process.env.NODE_ENV !== "production") {
    return Buffer.from("sharp-spice-dev-secret-change-me", "utf8");
  }
  throw new Error("AUTH_SECRET is not configured");
}

function uuidToHex(id: string): string | null {
  const hex = id.trim().replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(hex) ? hex : null;
}

function hexToUuid(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Compact token for ms-word: links.
 * - v1: UUID-only (legacy)
 * - v2: any string ids (legacy-q-*, formgrid, etc.) via base64url payload
 */
export function mintCompactCaseFileToken(
  input: CaseFileAccessClaims & { expiresInSec?: number },
): string {
  const exp =
    Math.floor(Date.now() / 1000) + (input.expiresInSec ?? DEFAULT_TTL_SEC);
  const fileHex = uuidToHex(input.fileId);
  const caseHex = uuidToHex(input.questionnaireId);

  if (fileHex && caseHex) {
    const body = `v1.${exp}.${fileHex}.${caseHex}`;
    const sig = createHmac("sha256", getAuthSecretKey())
      .update(body)
      .digest("base64url")
      .slice(0, 22);
    return `${body}.${sig}`;
  }

  const fileId = input.fileId.trim();
  const questionnaireId = input.questionnaireId.trim();
  if (!fileId || !questionnaireId) {
    throw new Error("INVALID_IDS");
  }
  if (fileId.includes("\n") || questionnaireId.includes("\n")) {
    throw new Error("INVALID_IDS");
  }

  const payload = Buffer.from(`${fileId}\n${questionnaireId}`, "utf8").toString(
    "base64url",
  );
  const body = `v2.${exp}.${payload}`;
  const sig = createHmac("sha256", getAuthSecretKey())
    .update(body)
    .digest("base64url")
    .slice(0, 16);
  return `${body}.${sig}`;
}

export function verifyCompactCaseFileToken(
  token: string,
): CaseFileAccessClaims | null {
  const parts = token.trim().split(".");
  if (parts.length < 4) return null;
  const version = parts[0];

  if (version === "v1") {
    if (parts.length !== 5) return null;
    const [, expRaw, fileHex, caseHex, sig] = parts;
    if (!expRaw || !fileHex || !caseHex || !sig) return null;
    if (!/^[0-9a-f]{32}$/.test(fileHex) || !/^[0-9a-f]{32}$/.test(caseHex)) {
      return null;
    }
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;

    const body = `v1.${expRaw}.${fileHex}.${caseHex}`;
    const expected = createHmac("sha256", getAuthSecretKey())
      .update(body)
      .digest("base64url")
      .slice(0, 22);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    return {
      fileId: hexToUuid(fileHex),
      questionnaireId: hexToUuid(caseHex),
    };
  }

  if (version === "v2") {
    if (parts.length !== 4) return null;
    const [, expRaw, payload, sig] = parts;
    if (!expRaw || !payload || !sig) return null;
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;

    const body = `v2.${expRaw}.${payload}`;
    const expected = createHmac("sha256", getAuthSecretKey())
      .update(body)
      .digest("base64url")
      .slice(0, 16);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    let decoded: string;
    try {
      decoded = Buffer.from(payload, "base64url").toString("utf8");
    } catch {
      return null;
    }
    const sep = decoded.indexOf("\n");
    if (sep <= 0 || sep === decoded.length - 1) return null;
    const fileId = decoded.slice(0, sep);
    const questionnaireId = decoded.slice(sep + 1);
    if (!fileId || !questionnaireId || questionnaireId.includes("\n")) {
      return null;
    }
    return { fileId, questionnaireId };
  }

  return null;
}

export function isWordOpenUrlWithinLimit(absoluteFileUrl: string): boolean {
  return absoluteFileUrl.length <= WORD_URI_DOC_URL_MAX;
}
