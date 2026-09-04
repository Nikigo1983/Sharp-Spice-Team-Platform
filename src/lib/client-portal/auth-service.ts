import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type {
  ClientPortalInvitation,
  ClientPortalLocale,
  ClientPortalUser,
  ClientSession,
} from "./types";
import {
  findClientPortalUserByEmail,
  findInvitationByToken,
  upsertClientPortalUser,
  upsertInvitation,
  listClientPortalInvitations,
  insertPasswordReset,
  findValidPasswordResetByTokenHash,
  markPasswordResetUsed,
} from "./local-store";
import { createClientSession } from "./session";
import { sendClientInviteEmail } from "./portal-emails";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateTemporaryPassword(): string {
  // Readable for email copy: no ambiguous chars
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type CreateInvitationResult = {
  invitation: ClientPortalInvitation;
  temporaryPassword: string;
  loginUrl: string;
  emailSent: boolean;
  emailError?: "EMAIL_NOT_CONFIGURED" | "EMAIL_SEND_FAILED";
};

export async function createClientInvitation(input: {
  email: string;
  firstName: string;
  preferredLocale?: ClientPortalLocale;
  createdByUserId: string;
  origin: string;
}): Promise<CreateInvitationResult> {
  const email = normalizeEmail(input.email);
  if (!email || !input.firstName.trim()) {
    throw new Error("INVALID_INVITE");
  }

  const existing = await findClientPortalUserByEmail(email);
  if (existing) {
    throw new Error("EMAIL_TAKEN");
  }

  const now = new Date().toISOString();
  const temporaryPassword = generateTemporaryPassword();
  const invitation: ClientPortalInvitation = {
    id: randomUUID(),
    token: randomBytes(24).toString("hex"),
    email,
    firstName: input.firstName.trim(),
    preferredLocale: input.preferredLocale ?? "ru",
    createdByUserId: input.createdByUserId,
    createdAt: now,
    acceptedAt: now,
    status: "accepted",
  };

  const user: ClientPortalUser = {
    id: randomUUID(),
    email,
    firstName: invitation.firstName,
    preferredLocale: invitation.preferredLocale,
    invitationId: invitation.id,
    passwordHash: await bcrypt.hash(temporaryPassword, 10),
    createdAt: now,
    updatedAt: now,
  };

  await upsertInvitation(invitation);
  await upsertClientPortalUser(user);

  const origin = input.origin.replace(/\/$/, "");
  const loginUrl = `${origin}/client/login`;

  const mailed = await sendClientInviteEmail({
    to: email,
    firstName: invitation.firstName,
    loginUrl,
    temporaryPassword,
  });

  return {
    invitation,
    temporaryPassword,
    loginUrl,
    emailSent: mailed.ok,
    emailError: mailed.ok ? undefined : mailed.code,
  };
}

export async function listInvitationsForStaff(): Promise<
  ClientPortalInvitation[]
> {
  return listClientPortalInvitations();
}

export async function acceptInvitation(input: {
  token: string;
  password: string;
}): Promise<ClientSession> {
  const invitation = await findInvitationByToken(input.token.trim());
  if (!invitation) {
    throw new Error("INVITE_INVALID");
  }

  if (input.password.trim().length < 8) {
    throw new Error("PASSWORD_TOO_SHORT");
  }

  const existing = await findClientPortalUserByEmail(invitation.email);
  if (existing) {
    // Account already provisioned by staff invite email — use login instead.
    throw new Error("EMAIL_TAKEN");
  }

  if (invitation.status !== "pending") {
    throw new Error("INVITE_INVALID");
  }

  const now = new Date().toISOString();
  const user: ClientPortalUser = {
    id: randomUUID(),
    email: invitation.email,
    firstName: invitation.firstName,
    preferredLocale: invitation.preferredLocale,
    invitationId: invitation.id,
    passwordHash: await bcrypt.hash(input.password, 10),
    createdAt: now,
    updatedAt: now,
  };

  await upsertClientPortalUser(user);
  await upsertInvitation({
    ...invitation,
    status: "accepted",
    acceptedAt: now,
  });

  const session: ClientSession = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    preferredLocale: user.preferredLocale,
    invitationId: user.invitationId,
  };
  await createClientSession(session);
  return session;
}

export async function signInClientPortal(input: {
  email: string;
  password: string;
}): Promise<ClientSession> {
  const user = await findClientPortalUserByEmail(input.email);
  if (!user) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const session: ClientSession = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    preferredLocale: user.preferredLocale,
    invitationId: user.invitationId,
  };
  await createClientSession(session);
  return session;
}

export async function requestClientPasswordReset(input: {
  email: string;
  origin: string;
}): Promise<{ ok: true }> {
  const email = normalizeEmail(input.email);
  // Always succeed publicly (no account enumeration).
  if (!email.includes("@")) {
    return { ok: true };
  }

  const user = await findClientPortalUserByEmail(email);
  if (!user) {
    return { ok: true };
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashPasswordResetToken(token);
  const now = Date.now();
  await insertPasswordReset({
    id: randomUUID(),
    userId: user.id,
    tokenHash,
    expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
    usedAt: null,
    createdAt: new Date(now).toISOString(),
  });

  const resetUrl = `${input.origin.replace(/\/$/, "")}/client/reset-password?token=${encodeURIComponent(token)}`;
  const { sendClientPasswordResetEmail } = await import("./portal-emails");
  await sendClientPasswordResetEmail({
    to: user.email,
    firstName: user.firstName,
    resetUrl,
  });

  return { ok: true };
}

export async function resetClientPasswordWithToken(input: {
  token: string;
  password: string;
}): Promise<void> {
  if (input.password.trim().length < 8) {
    throw new Error("PASSWORD_TOO_SHORT");
  }

  const tokenHash = hashPasswordResetToken(input.token.trim());
  const reset = await findValidPasswordResetByTokenHash(tokenHash);
  if (!reset) {
    throw new Error("RESET_INVALID");
  }

  const { findClientPortalUserById } = await import("./local-store");
  const user = await findClientPortalUserById(reset.userId);
  if (!user) {
    throw new Error("RESET_INVALID");
  }

  const now = new Date().toISOString();
  await upsertClientPortalUser({
    ...user,
    passwordHash: await bcrypt.hash(input.password, 10),
    updatedAt: now,
  });
  await markPasswordResetUsed(reset.id, now);
}

export function buildInviteUrl(token: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/client/invite/${encodeURIComponent(token)}`;
}

export function buildLoginUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/client/login`;
}
