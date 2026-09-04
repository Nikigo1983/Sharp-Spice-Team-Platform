"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  acceptInvitation,
  requestClientPasswordReset,
  resetClientPasswordWithToken,
  signInClientPortal,
} from "@/lib/client-portal/auth-service";
import { destroyClientSession } from "@/lib/client-portal/session";

export type ClientAuthState = {
  error?: string;
  ok?: boolean;
};

export async function clientSignInAction(
  _prev: ClientAuthState,
  formData: FormData,
): Promise<ClientAuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Введите email и пароль." };
  }

  try {
    await signInClientPortal({ email, password });
  } catch {
    return { error: "Неверный email или пароль." };
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

  if (!token) {
    return { error: "Ссылка приглашения недействительна." };
  }
  if (password.length < 8) {
    return { error: "Пароль должен быть не короче 8 символов." };
  }
  if (password !== passwordConfirm) {
    return { error: "Пароли не совпадают." };
  }

  try {
    await acceptInvitation({ token, password });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVITE_INVALID";
    if (code === "EMAIL_TAKEN") {
      return { error: "Аккаунт с этим email уже создан. Войдите в портал." };
    }
    if (code === "PASSWORD_TOO_SHORT") {
      return { error: "Пароль должен быть не короче 8 символов." };
    }
    return { error: "Приглашение недействительно или уже использовано." };
  }

  redirect("/client");
}

export async function clientForgotPasswordAction(
  _prev: ClientAuthState,
  formData: FormData,
): Promise<ClientAuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Введите email." };
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

  if (!token) {
    return { error: "Ссылка сброса недействительна." };
  }
  if (password.length < 8) {
    return { error: "Пароль должен быть не короче 8 символов." };
  }
  if (password !== passwordConfirm) {
    return { error: "Пароли не совпадают." };
  }

  try {
    await resetClientPasswordWithToken({ token, password });
  } catch (error) {
    const code = error instanceof Error ? error.message : "RESET_INVALID";
    if (code === "PASSWORD_TOO_SHORT") {
      return { error: "Пароль должен быть не короче 8 символов." };
    }
    return { error: "Ссылка сброса недействительна или устарела." };
  }

  redirect("/client/login");
}

export async function clientSignOutAction(): Promise<void> {
  await destroyClientSession();
  redirect("/client/login");
}
