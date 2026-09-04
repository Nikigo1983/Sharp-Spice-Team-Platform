export type ClientPortalLocale = "ru" | "en";

export type ClientSession = {
  id: string;
  email: string;
  firstName: string;
  preferredLocale: ClientPortalLocale;
  invitationId: string | null;
};

export type ClientPortalInvitation = {
  id: string;
  token: string;
  email: string;
  firstName: string;
  preferredLocale: ClientPortalLocale;
  createdByUserId: string;
  createdAt: string;
  acceptedAt: string | null;
  status: "pending" | "accepted" | "revoked";
};

export type ClientPortalUser = {
  id: string;
  email: string;
  firstName: string;
  preferredLocale: ClientPortalLocale;
  invitationId: string | null;
  /** bcrypt hash */
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

export type ClientPortalPasswordReset = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
};

export function isClientPortalLocale(value: string): value is ClientPortalLocale {
  return value === "ru" || value === "en";
}
