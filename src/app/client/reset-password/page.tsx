import { ClientResetPasswordForm } from "@/components/client-portal/ClientResetPasswordForm";

export default async function ClientResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  return <ClientResetPasswordForm token={String(params.token ?? "")} />;
}
