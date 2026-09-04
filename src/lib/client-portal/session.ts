import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { ClientSession } from "./types";
import { isClientPortalLocale } from "./types";
import { findClientPortalUserById } from "./local-store";

export const CLIENT_SESSION_COOKIE = "ss_client_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

function getAuthSecret(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) {
    return new TextEncoder().encode(secret);
  }
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode("sharp-spice-dev-secret-change-me");
  }
  return null;
}

export async function createClientSession(user: ClientSession): Promise<void> {
  const secret = getAuthSecret();
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured");
  }

  const token = await new SignJWT({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    preferredLocale: user.preferredLocale,
    invitationId: user.invitationId,
    audience: "client-portal",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret);

  const cookieStore = await cookies();
  cookieStore.set(CLIENT_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroyClientSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CLIENT_SESSION_COOKIE);
}

export async function getClientSessionFromToken(
  token: string | undefined,
): Promise<ClientSession | null> {
  const secret = getAuthSecret();
  if (!secret || !token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.audience !== "client-portal") return null;

    const id = typeof payload.id === "string" ? payload.id : null;
    const email = typeof payload.email === "string" ? payload.email : null;
    const firstName =
      typeof payload.firstName === "string" ? payload.firstName : null;
    const preferredLocale =
      typeof payload.preferredLocale === "string"
        ? payload.preferredLocale
        : null;
    const invitationId =
      typeof payload.invitationId === "string" || payload.invitationId === null
        ? (payload.invitationId as string | null)
        : null;

    if (
      !id ||
      !email ||
      !firstName ||
      !preferredLocale ||
      !isClientPortalLocale(preferredLocale)
    ) {
      return null;
    }

    return {
      id,
      email,
      firstName,
      preferredLocale,
      invitationId,
    };
  } catch {
    return null;
  }
}

/**
 * Server-side client portal session.
 * Separate from employee `ss_session` — never elevates to staff roles.
 */
export async function getClientSession(): Promise<ClientSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CLIENT_SESSION_COOKIE)?.value;
  const session = await getClientSessionFromToken(token);
  if (!session) return null;

  const user = await findClientPortalUserById(session.id);
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    preferredLocale: user.preferredLocale,
    invitationId: user.invitationId,
  };
}
