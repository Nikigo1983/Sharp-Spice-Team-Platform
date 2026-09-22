import { SignJWT, jwtVerify } from "jose";

const PURPOSE = "case-file-access";
const DEFAULT_TTL_SEC = 180;

function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) return new TextEncoder().encode(secret);
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode("sharp-spice-dev-secret-change-me");
  }
  throw new Error("AUTH_SECRET is not configured");
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
    .sign(getAuthSecret());
}

export async function verifyCaseFileAccessToken(
  token: string,
): Promise<CaseFileAccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
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

/** Desktop Word protocol — opens installed Microsoft Word with the remote file URL. */
export function toMsWordOpenUri(absoluteFileUrl: string): string {
  return `ms-word:ofv|u|${absoluteFileUrl}`;
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
