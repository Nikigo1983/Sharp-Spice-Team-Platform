import { SignJWT, jwtVerify } from "jose";

const PURPOSE = "case-file-access";
/** Long enough for Word security prompt + download over slow networks. */
const DEFAULT_TTL_SEC = 600;

function getAuthSecretBytes(): Uint8Array {
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

/**
 * Desktop Word protocol URI (`ofe` = open for edit).
 * Document URL must stay short (~256 char Office limit).
 */
export function toMsWordOpenUri(absoluteFileUrl: string): string {
  return `ms-word:ofe|u|${absoluteFileUrl}`;
}

export type MsWordLaunchInput = {
  /** Preferred: same-origin URL that 302-redirects to ms-word: (avoids Chrome `|` encoding). */
  launchUrl?: string;
  /** Direct protocol URI: ms-word:ofe|u|https://… */
  msWordUri: string;
  /** Pipe-free fallback: ms-word:https://… */
  abbreviatedUri?: string;
};

function clickProtocolHref(href: string): void {
  const anchor = document.createElement("a");
  // setAttribute avoids some `.href` setter normalizations; Chrome may still
  // encode `|` on navigation — prefer launchUrl redirect when available.
  anchor.setAttribute("href", href);
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Launch desktop Word. Order matters for licensed Office + Chrome:
 * 1) same-origin 302 → ms-word: (literal pipes in Location)
 * 2) direct ofe URI (works in Edge / some browsers)
 * 3) abbreviated ms-word:https://… (no pipes)
 */
export function launchMsWordProtocol(
  msWordUriOrInput: string | MsWordLaunchInput,
): void {
  if (typeof document === "undefined") return;

  const input: MsWordLaunchInput =
    typeof msWordUriOrInput === "string"
      ? { msWordUri: msWordUriOrInput }
      : msWordUriOrInput;

  const nav = navigator as Navigator & {
    msLaunchUri?: (
      uri: string,
      successCb?: () => void,
      failCb?: () => void,
    ) => void;
  };
  if (typeof nav.msLaunchUri === "function") {
    nav.msLaunchUri(input.msWordUri);
    return;
  }

  if (input.launchUrl) {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("src", input.launchUrl);
    iframe.setAttribute(
      "style",
      "position:absolute;width:0;height:0;border:0;visibility:hidden",
    );
    document.body.appendChild(iframe);
    window.setTimeout(() => iframe.remove(), 5000);
  }

  clickProtocolHref(input.msWordUri);

  if (input.abbreviatedUri && input.abbreviatedUri !== input.msWordUri) {
    window.setTimeout(() => clickProtocolHref(input.abbreviatedUri!), 400);
  }
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
