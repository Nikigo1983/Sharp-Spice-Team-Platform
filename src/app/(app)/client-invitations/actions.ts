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
  } catch (error) {
    console.error("[client-portal] create invitation", error);
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_INVITE") {
      return { ok: false, error: "Укажите имя и корректный email." };
    }
    if (/relation .* does not exist|Could not find the table/i.test(message)) {
      return {
        ok: false,
        error:
          "Таблицы клиентского портала ещё не созданы в Supabase. Выполните миграцию 021_client_portal.sql.",
      };
    }
    return {
      ok: false,
      error: "Не удалось создать приглашение. Проверьте подключение к базе.",
    };
  }
}
