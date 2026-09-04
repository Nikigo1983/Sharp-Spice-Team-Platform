"use server";

import { headers } from "next/headers";
import { getSession } from "@/lib/auth/session";
import {
  buildInviteUrl,
  createClientInvitation,
} from "@/lib/client-portal/auth-service";
import type { InvitationRow } from "@/components/client-portal/ClientInvitationsPanel";

export async function createClientInvitationAction(input: {
  email: string;
  firstName: string;
}): Promise<
  | { ok: true; invitation: InvitationRow }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) {
    return { ok: false, error: "Нужна авторизация сотрудника." };
  }

  try {
    const invitation = await createClientInvitation({
      email: input.email,
      firstName: input.firstName,
      createdByUserId: session.id,
    });

    const headerStore = await headers();
    const host =
      headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "";
    const proto = headerStore.get("x-forwarded-proto") ?? "http";
    const origin = host ? `${proto}://${host}` : "http://localhost:3000";

    return {
      ok: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        firstName: invitation.firstName,
        status: invitation.status,
        createdAt: invitation.createdAt,
        inviteUrl: buildInviteUrl(invitation.token, origin),
      },
    };
  } catch {
    return { ok: false, error: "Не удалось создать приглашение." };
  }
}
