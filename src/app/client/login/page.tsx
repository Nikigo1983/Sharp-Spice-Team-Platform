import { redirect } from "next/navigation";
import { ClientPortalLoginForm } from "@/components/client-portal/ClientPortalLoginForm";
import { normalizeClientLocale } from "@/lib/client-portal/portal-i18n";
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
  const fromInviteLink = isClientPortalLocale(langParam ?? "");
  const locale = fromInviteLink
    ? normalizeClientLocale(langParam)
    : await resolveClientPortalLocale();

  return (
    <ClientPortalLoginForm locale={locale} persistLocale={fromInviteLink} />
  );
}
