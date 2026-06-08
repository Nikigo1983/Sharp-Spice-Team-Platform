"use server";

import { redirect } from "next/navigation";
import { canAccessPath } from "@/lib/auth/permissions";
import { createSession, destroySession } from "@/lib/auth/session";
import {
  findUserByEmail,
  toSessionUser,
  verifyUserPassword,
} from "@/lib/auth/users";

export type SignInState = {
  error?: string;
};

export async function signInAction(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = String(formData.get("next") ?? "").trim();

  if (!email || !password) {
    return { error: "Введите email и пароль." };
  }

  const user = findUserByEmail(email);
  if (!user) {
    return {
      error: "Этот email не зарегистрирован. Обратитесь к администратору платформы.",
    };
  }

  const valid = await verifyUserPassword(user, password);
  if (!valid) {
    return { error: "Неверный email или пароль." };
  }

  const sessionUser = toSessionUser(user);
  await createSession(sessionUser);

  if (nextPath && canAccessPath(sessionUser.role, nextPath)) {
    redirect(nextPath);
  }

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
