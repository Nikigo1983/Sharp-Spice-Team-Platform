"use client";

import { useActionState } from "react";
import { signInAction, type SignInState } from "@/app/login/actions";
import styles from "@/app/login/login.module.css";

const initialState: SignInState = {};

const isDev = process.env.NODE_ENV === "development";

type LoginFormProps = {
  nextPath?: string;
};

export function LoginForm({ nextPath }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form className={styles.form} action={formAction}>
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <label className={styles.label}>
        Email
        <input
          type="email"
          name="email"
          className={styles.input}
          defaultValue={
            isDev ? "virineya1983@gmail.com" : undefined
          }
          placeholder="virineya1983@gmail.com"
          autoComplete="email"
          required
          disabled={pending}
        />
      </label>
      <label className={styles.label}>
        Пароль
        <input
          type="password"
          name="password"
          className={styles.input}
          defaultValue={isDev ? "veronika-dev" : undefined}
          placeholder={isDev ? "veronika-dev" : "••••••••"}
          autoComplete="current-password"
          required
          disabled={pending}
        />
      </label>
      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? "Вход…" : "Войти"}
      </button>
      <p className={styles.forgotHint}>
        Забыли пароль? Напишите администратору платформы — он сбросит его в
        разделе Settings.
      </p>
    </form>
  );
}
