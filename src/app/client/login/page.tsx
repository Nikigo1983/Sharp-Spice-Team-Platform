import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ClientPortalLoginForm } from "@/components/client-portal/ClientPortalLoginForm";
import {
  CLIENT_LOCALE_COOKIE,
  normalizeClientLocale,
} from "@/lib/client-portal/portal-i18n";
import { resolveClientPortalLocale } from "@/lib/client-portal/resolve-locale";
import { getClientSession } from "@/lib/client-portal/session";
import { isClientPortalLocale } from "@/lib/client-portal/types";

export default async function ClientLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const session = await getClientSession();
  if (session) {
    redirect("/client");
  }

  const params = await searchParams;
  const langParam = params.lang?.trim().toLowerCase();
  if (isClientPortalLocale(langParam ?? "")) {
    const cookieStore = await cookies();
    cookieStore.set(CLIENT_LOCALE_COOKIE, langParam!, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  const locale = isClientPortalLocale(langParam ?? "")
    ? normalizeClientLocale(langParam)
    : await resolveClientPortalLocale();

  return <ClientPortalLoginForm locale={locale} />;
}
