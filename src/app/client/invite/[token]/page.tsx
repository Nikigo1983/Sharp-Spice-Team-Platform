import type { Metadata } from "next";
import { ClientInviteAcceptForm } from "@/components/client-portal/ClientInviteAcceptForm";
import { findInvitationByToken } from "@/lib/client-portal/local-store";
import { BRAND_NAME } from "@/lib/brand";

type Props = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: `${BRAND_NAME} — приглашение клиента`,
  robots: { index: false, follow: false },
};

export default async function ClientInvitePage({ params }: Props) {
  const { token: raw } = await params;
  let token = raw;
  try {
    token = decodeURIComponent(raw);
  } catch {
    token = "";
  }

  const invitation = token ? await findInvitationByToken(token) : null;
  const invalid = !invitation || invitation.status !== "pending";

  return (
    <ClientInviteAcceptForm
      token={token}
      email={invitation?.email ?? ""}
      firstName={invitation?.firstName ?? ""}
      invalid={invalid}
    />
  );
}
