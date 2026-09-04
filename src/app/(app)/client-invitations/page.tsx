import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ClientInvitationsPanel,
  type InvitationRow,
} from "@/components/client-portal/ClientInvitationsPanel";
import { getSession } from "@/lib/auth/session";
import {
  buildInviteUrl,
  listInvitationsForStaff,
} from "@/lib/client-portal/auth-service";

export default async function ClientInvitationsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/client-invitations");
  }

  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const origin = host ? `${proto}://${host}` : "http://localhost:3000";

  const invitations = await listInvitationsForStaff();
  const rows: InvitationRow[] = invitations.map((item) => ({
    id: item.id,
    email: item.email,
    firstName: item.firstName,
    status: item.status,
    createdAt: item.createdAt,
    inviteUrl: buildInviteUrl(item.token, origin),
  }));

  return <ClientInvitationsPanel initialInvitations={rows} />;
}
