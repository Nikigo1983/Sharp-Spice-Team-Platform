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
  | {
      ok: true;
      invitation: InvitationRow;
      temporaryPassword: string;
      loginUrl: string;
      emailSent: boolean;
      emailWarning?: string;
    }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) {
    return { ok: false, error: "Нужна авторизация сотрудника." };
  }

  try {
    const headerStore = await headers();
    const host =
      headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "";
    const proto = headerStore.get("x-forwarded-proto") ?? "http";
    const origin =
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      (host ? `${proto}://${host}` : "http://localhost:3000");

    const result = await createClientInvitation({
      email: input.email,
      firstName: input.firstName,
      createdByUserId: session.id,
      origin,
    });

    return {
      ok: true,
      invitation: {
        id: result.invitation.id,
        email: result.invitation.email,
        firstName: result.invitation.firstName,
        status: result.invitation.status,
        createdAt: result.invitation.createdAt,
        inviteUrl: buildInviteUrl(result.invitation.token, origin),
      },
      temporaryPassword: result.temporaryPassword,
      loginUrl: result.loginUrl,
      emailSent: result.emailSent,
      emailWarning: result.emailSent
        ? undefined
        : result.emailError === "EMAIL_NOT_CONFIGURED"
          ? "Письмо не отправлено: на сервере не задан RESEND_API_KEY. Скопируйте пароль и передайте клиенту вручную."
          : "Не удалось отправить письмо. Скопируйте пароль и передайте клиенту вручную.",
    };
  } catch (error) {
    console.error("[client-portal] create invitation", error);
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_INVITE") {
      return { ok: false, error: "Укажите имя и корректный email." };
    }
    if (message === "EMAIL_TAKEN") {
      return {
        ok: false,
        error: "Клиент с этим email уже есть в портале.",
      };
    }
    if (/relation .* does not exist|Could not find the table/i.test(message)) {
      return {
        ok: false,
        error:
          "Таблицы клиентского портала ещё не созданы в Supabase. Выполните миграции 021 и 022.",
      };
    }
    return {
      ok: false,
      error: "Не удалось создать приглашение. Проверьте подключение к базе.",
    };
  }
}
