"use server";

import { redirect } from "next/navigation";
import {
  acceptInvitation,
  signInClientPortal,
} from "@/lib/client-portal/auth-service";
import { destroyClientSession } from "@/lib/client-portal/session";

export type ClientAuthState = {
  error?: string;
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

export async function clientSignOutAction(): Promise<void> {
  await destroyClientSession();
  redirect("/client/login");
}
