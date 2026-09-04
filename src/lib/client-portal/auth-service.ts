import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
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
} from "./local-store";
import { createClientSession } from "./session";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createClientInvitation(input: {
  email: string;
  firstName: string;
  preferredLocale?: ClientPortalLocale;
  createdByUserId: string;
}): Promise<ClientPortalInvitation> {
  const email = normalizeEmail(input.email);
  if (!email || !input.firstName.trim()) {
    throw new Error("INVALID_INVITE");
  }

  const invitation: ClientPortalInvitation = {
    id: randomUUID(),
    token: randomBytes(24).toString("hex"),
    email,
    firstName: input.firstName.trim(),
    preferredLocale: input.preferredLocale ?? "ru",
    createdByUserId: input.createdByUserId,
    createdAt: new Date().toISOString(),
    acceptedAt: null,
    status: "pending",
  };

  await upsertInvitation(invitation);
  return invitation;
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
  if (!invitation || invitation.status !== "pending") {
    throw new Error("INVITE_INVALID");
  }

  if (input.password.trim().length < 8) {
    throw new Error("PASSWORD_TOO_SHORT");
  }

  const existing = await findClientPortalUserByEmail(invitation.email);
  if (existing) {
    throw new Error("EMAIL_TAKEN");
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

export function buildInviteUrl(token: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/client/invite/${encodeURIComponent(token)}`;
}
