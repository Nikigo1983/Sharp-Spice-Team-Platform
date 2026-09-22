import { ClientPortalLoginForm } from "@/components/client-portal/ClientPortalLoginForm";
import { redirect } from "next/navigation";
import { resolveClientPortalLocale } from "@/lib/client-portal/resolve-locale";
import { getClientSession } from "@/lib/client-portal/session";

export default async function ClientLoginPage() {
  const session = await getClientSession();
  if (session) {
    redirect("/client");
  }
  const locale = await resolveClientPortalLocale();
  return <ClientPortalLoginForm locale={locale} />;
}
