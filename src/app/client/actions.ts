"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  acceptInvitation,
  requestClientPasswordReset,
  resetClientPasswordWithToken,
  signInClientPortal,
  updateClientPreferredLocale,
} from "@/lib/client-portal/auth-service";
import {
  CLIENT_LOCALE_COOKIE,
  normalizeClientLocale,
  t,
} from "@/lib/client-portal/portal-i18n";
import { destroyClientSession } from "@/lib/client-portal/session";
import type { ClientPortalLocale } from "@/lib/client-portal/types";

export type ClientAuthState = {
  error?: string;
  ok?: boolean;
};

function localeFromForm(formData: FormData): ClientPortalLocale {
  return normalizeClientLocale(String(formData.get("locale") ?? ""));
}

export async function clientSignInAction(
  _prev: ClientAuthState,
  formData: FormData,
): Promise<ClientAuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const locale = localeFromForm(formData);

  if (!email || !password) {
    return { error: t("enterEmailPassword", locale) };
  }

  try {
    const session = await signInClientPortal({ email, password });
    const cookieStore = await cookies();
    const guestLocale = normalizeClientLocale(
      cookieStore.get(CLIENT_LOCALE_COOKIE)?.value ?? locale,
    );
    if (guestLocale !== session.preferredLocale) {
      await updateClientPreferredLocale({
        userId: session.id,
        preferredLocale: guestLocale,
      });
    }
  } catch {
    return { error: t("invalidCredentials", locale) };
  }

  redirect("/client");
}

export async function clientAcceptInviteAction(
  _prev: ClientAuthState,
  formData: FormData,
): Promise<ClientAuthState> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const locale = localeFromForm(formData);

  if (!token) {
    return { error: t("inviteInvalid", locale) };
  }
  if (password.length < 8) {
    return { error: t("passwordTooShort", locale) };
  }
  if (password !== passwordConfirm) {
    return { error: t("passwordsMismatch", locale) };
  }

  try {
    const session = await acceptInvitation({ token, password });
    if (locale !== session.preferredLocale) {
      await updateClientPreferredLocale({
        userId: session.id,
        preferredLocale: locale,
      });
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVITE_INVALID";
    if (code === "EMAIL_TAKEN") {
      return { error: t("emailTaken", locale) };
    }
    if (code === "PASSWORD_TOO_SHORT") {
      return { error: t("passwordTooShort", locale) };
    }
    return { error: t("inviteUsed", locale) };
  }

  redirect("/client");
}

export async function clientForgotPasswordAction(
  _prev: ClientAuthState,
  formData: FormData,
): Promise<ClientAuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const locale = localeFromForm(formData);
  if (!email) {
    return { error: t("enterEmail", locale) };
  }

  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (host ? `${proto}://${host}` : "http://localhost:3000");

  await requestClientPasswordReset({ email, origin });
  return { ok: true };
}

export async function clientResetPasswordAction(
  _prev: ClientAuthState,
  formData: FormData,
): Promise<ClientAuthState> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const locale = localeFromForm(formData);

  if (!token) {
    return { error: t("invalidReset", locale) };
  }
  if (password.length < 8) {
    return { error: t("passwordTooShort", locale) };
  }
  if (password !== passwordConfirm) {
    return { error: t("passwordsMismatch", locale) };
  }

  try {
    await resetClientPasswordWithToken({ token, password });
  } catch (error) {
    const code = error instanceof Error ? error.message : "RESET_INVALID";
    if (code === "PASSWORD_TOO_SHORT") {
      return { error: t("passwordTooShort", locale) };
    }
    return { error: t("invalidReset", locale) };
  }

  return { ok: true };
}

export async function clientSignOutAction(): Promise<void> {
  await destroyClientSession();
  redirect("/client/login");
}
