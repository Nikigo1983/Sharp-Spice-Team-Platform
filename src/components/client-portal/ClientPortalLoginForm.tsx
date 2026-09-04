"use client";

import { useActionState } from "react";
import {
  clientSignInAction,
  type ClientAuthState,
} from "@/app/client/actions";
import { Logo } from "@/components/ui/Logo";
import { BRAND_NAME } from "@/lib/brand";
import styles from "./ClientPortal.module.css";

const initialState: ClientAuthState = {};

export function ClientPortalLoginForm() {
  const [state, formAction, pending] = useActionState(
    clientSignInAction,
    initialState,
  );

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <Logo size="md" />
        </div>
        <h1 className={styles.title}>Клиентский портал</h1>
        <p className={styles.subtitle}>
          Вход для клиентов {BRAND_NAME}. Старый поток Formgrid / App Emigrant не
          затронут — это новый канал.
        </p>
        {state.error ? (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        ) : null}
        <form className={styles.form} action={formAction}>
          <label className={styles.label}>
            Email
            <input
              className={styles.input}
              type="email"
              name="email"
              autoComplete="email"
              required
              disabled={pending}
            />
          </label>
          <label className={styles.label}>
            Пароль
            <input
              className={styles.input}
              type="password"
              name="password"
              autoComplete="current-password"
              required
              disabled={pending}
            />
          </label>
          <button className={styles.submit} type="submit" disabled={pending}>
            {pending ? "Вход…" : "Войти"}
          </button>
        </form>
        <p className={styles.hint}>
          Нет аккаунта? Используйте ссылку из приглашения менеджера.
        </p>
      </div>
    </div>
  );
}
