import { ClientResetPasswordForm } from "@/components/client-portal/ClientResetPasswordForm";
import { resolveClientPortalLocale } from "@/lib/client-portal/resolve-locale";

export default async function ClientResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const locale = await resolveClientPortalLocale();
  return (
    <ClientResetPasswordForm
      token={String(params.token ?? "")}
      locale={locale}
    />
  );
}
