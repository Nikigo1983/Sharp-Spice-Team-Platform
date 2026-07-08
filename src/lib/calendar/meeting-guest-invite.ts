import "server-only";

import { randomBytes } from "node:crypto";
export { isGuestParticipantId } from "./meeting-guest-client";

export function generateGuestInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function getPlatformBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${vercel.replace(/\/+$/, "")}`;
  }

  return "http://localhost:3000";
}

export function buildGuestJoinUrl(token: string, baseUrl?: string): string {
  const origin = (baseUrl ?? getPlatformBaseUrl()).replace(/\/+$/, "");
  return `${origin}/join/${encodeURIComponent(token)}`;
}

export function normalizeGuestDisplayName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 80) {
    return null;
  }

  return trimmed;
}
