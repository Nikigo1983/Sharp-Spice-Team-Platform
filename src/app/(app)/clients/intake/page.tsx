import { redirect } from "next/navigation";
import { ClientPortalIntakePanel } from "@/components/client-portal/ClientPortalIntakePanel";
import { getSession } from "@/lib/auth/session";

type PageProps = {
  searchParams: Promise<{ id?: string }>;
};

export default async function ClientPortalIntakePage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/clients/intake");
  }

  const { id } = await searchParams;
  return <ClientPortalIntakePanel initialCaseId={id ?? null} />;
}
