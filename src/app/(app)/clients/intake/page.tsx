import { redirect } from "next/navigation";
import { ClientPortalIntakePanel } from "@/components/client-portal/ClientPortalIntakePanel";
import { getSession } from "@/lib/auth/session";

export default async function ClientPortalIntakePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/clients/intake");
  }

  return <ClientPortalIntakePanel />;
}
