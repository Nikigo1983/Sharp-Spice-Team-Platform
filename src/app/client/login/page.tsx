import { redirect } from "next/navigation";
import { ClientPortalLoginForm } from "@/components/client-portal/ClientPortalLoginForm";
import { getClientSession } from "@/lib/client-portal/session";

export default async function ClientLoginPage() {
  const session = await getClientSession();
  if (session) {
    redirect("/client");
  }
  return <ClientPortalLoginForm />;
}
