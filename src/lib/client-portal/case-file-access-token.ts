import { createHmac, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

const PURPOSE = "case-file-access";
/** Long enough for Word security prompt + download over slow networks. */
const DEFAULT_TTL_SEC = 600;

/**
 * Microsoft Word URI scheme rejects document URLs longer than ~256 chars on
 * many licensed installs (“Office doesn’t recognize the command”).
 * Keep office-open links well under that limit.
 */
const WORD_URI_DOC_URL_MAX = 240;

function getAuthSecretBytes(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) return new TextEncoder().encode(secret);
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode("sharp-spice-dev-secret-change-me");
  }
  throw new Error("AUTH_SECRET is not configured");
}

function getAuthSecretKey(): Buffer {
  return Buffer.from(getAuthSecretBytes());
}

export type CaseFileAccessClaims = {
  fileId: string;
  questionnaireId: string;
};

export async function mintCaseFileAccessToken(
  input: CaseFileAccessClaims & { expiresInSec?: number },
): Promise<string> {
  const ttl = input.expiresInSec ?? DEFAULT_TTL_SEC;
  return new SignJWT({
    purpose: PURPOSE,
    fileId: input.fileId,
    questionnaireId: input.questionnaireId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(getAuthSecretBytes());
}

export async function verifyCaseFileAccessToken(
  token: string,
): Promise<CaseFileAccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecretBytes());
    if (payload.purpose !== PURPOSE) return null;
    if (
      typeof payload.fileId !== "string" ||
      typeof payload.questionnaireId !== "string"
    ) {
      return null;
    }
    return {
      fileId: payload.fileId,
      questionnaireId: payload.questionnaireId,
    };
  } catch {
    return null;
  }
}

function uuidToHex(id: string): string | null {
  const hex = id.trim().replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(hex) ? hex : null;
}

function hexToUuid(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Compact token for ms-word: links (much shorter than JWT).
 * Format: v1.<exp>.<fileHex>.<caseHex>.<sig22>
 */
export function mintCompactCaseFileToken(
  input: CaseFileAccessClaims & { expiresInSec?: number },
): string {
  const fileHex = uuidToHex(input.fileId);
  const caseHex = uuidToHex(input.questionnaireId);
  if (!fileHex || !caseHex) {
    throw new Error("INVALID_IDS");
  }
  const exp =
    Math.floor(Date.now() / 1000) + (input.expiresInSec ?? DEFAULT_TTL_SEC);
  const body = `v1.${exp}.${fileHex}.${caseHex}`;
  const sig = createHmac("sha256", getAuthSecretKey())
    .update(body)
    .digest("base64url")
    .slice(0, 22);
  return `${body}.${sig}`;
}

export function verifyCompactCaseFileToken(
  token: string,
): CaseFileAccessClaims | null {
  const parts = token.trim().split(".");
  if (parts.length !== 5) return null;
  const [version, expRaw, fileHex, caseHex, sig] = parts;
  if (version !== "v1" || !expRaw || !fileHex || !caseHex || !sig) return null;
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

/**
 * Desktop Word protocol URI (`ofe` = open for edit).
 * Document URL must stay short — see WORD_URI_DOC_URL_MAX.
 */
export function toMsWordOpenUri(absoluteFileUrl: string): string {
  return `ms-word:ofe|u|${absoluteFileUrl}`;
}

export function isWordOpenUrlWithinLimit(absoluteFileUrl: string): boolean {
  return absoluteFileUrl.length <= WORD_URI_DOC_URL_MAX;
}

/** Launch desktop Word via the custom protocol (preferred over location.href). */
export function launchMsWordProtocol(msWordUri: string): void {
  if (typeof document === "undefined") return;
  const anchor = document.createElement("a");
  anchor.href = msWordUri;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** True when the browser can hand a file URL to desktop Microsoft Word. */
export function supportsDesktopMsWordProtocol(): boolean {
  if (typeof window === "undefined") return false;

  // Only treat real phone/tablet UAs as unsupported. Do NOT use `pointer: coarse`
  // — Windows touch laptops would wrongly fall back to download instead of Word.
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(
    window.navigator.userAgent,
  );

  return !mobileUa;
}
