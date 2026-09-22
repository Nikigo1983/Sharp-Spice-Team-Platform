import { ClientForgotPasswordForm } from "@/components/client-portal/ClientForgotPasswordForm";
import { resolveClientPortalLocale } from "@/lib/client-portal/resolve-locale";

export default async function ClientForgotPasswordPage() {
  const locale = await resolveClientPortalLocale();
  return <ClientForgotPasswordForm locale={locale} />;
}
