import "server-only";

import { cookies } from "next/headers";
import type { ClientPortalLocale } from "./types";
import {
  CLIENT_LOCALE_COOKIE,
  normalizeClientLocale,
} from "./portal-i18n";
import { getClientSession } from "./session";

/** Locale for client portal surfaces: session preference, else guest cookie. */
export async function resolveClientPortalLocale(): Promise<ClientPortalLocale> {
  const session = await getClientSession();
  if (session) return session.preferredLocale;
  const cookieStore = await cookies();
  return normalizeClientLocale(cookieStore.get(CLIENT_LOCALE_COOKIE)?.value);
}
