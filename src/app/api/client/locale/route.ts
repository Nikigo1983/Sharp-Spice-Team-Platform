import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { updateClientPreferredLocale } from "@/lib/client-portal/auth-service";
import {
  CLIENT_LOCALE_COOKIE,
  normalizeClientLocale,
} from "@/lib/client-portal/portal-i18n";
import { getClientSession } from "@/lib/client-portal/session";
import { isClientPortalLocale } from "@/lib/client-portal/types";

export async function PATCH(request: Request) {
  const body = (await request.json()) as { locale?: string };
  if (!isClientPortalLocale(body.locale ?? "")) {
    return NextResponse.json({ error: "INVALID_LOCALE" }, { status: 400 });
  }
  const locale = body.locale as "ru" | "en";

  const cookieStore = await cookies();
  cookieStore.set(CLIENT_LOCALE_COOKIE, locale, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  const session = await getClientSession();
  if (session) {
    const updated = await updateClientPreferredLocale({
      userId: session.id,
      preferredLocale: locale,
    });
    return NextResponse.json({
      locale: updated.preferredLocale,
      authenticated: true,
    });
  }

  return NextResponse.json({
    locale,
    authenticated: false,
  });
}
