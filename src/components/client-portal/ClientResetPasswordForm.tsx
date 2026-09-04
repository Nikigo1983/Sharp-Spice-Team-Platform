"use client";

import { useActionState } from "react";
import {
  clientResetPasswordAction,
  type ClientAuthState,
} from "@/app/client/actions";
import { Logo } from "@/components/ui/Logo";
import { BRAND_NAME } from "@/lib/brand";
import styles from "./ClientPortal.module.css";

const initialState: ClientAuthState = {};

export function ClientResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    clientResetPasswordAction,
    initialState,
  );

  if (!token) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logoWrap}>
            <Logo size="auth" />
          </div>
          <h1 className={styles.title}>Ссылка недействительна</h1>
          <p className={styles.subtitle}>
            Запросите новую ссылку для сброса пароля.
          </p>
          <a className={styles.linkButton} href="/client/forgot-password">
            Забыли пароль?
          </a>
        </div>
      </div>
    );
  }

  if (state.ok) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logoWrap}>
            <Logo size="auth" />
          </div>
          <h1 className={styles.title}>Пароль изменён</h1>
          <div className={styles.statusOk} role="status">
            <p className={styles.statusOkHint}>
              Ваш пароль успешно изменён. Теперь можно войти в клиентский
              портал с новым паролем.
            </p>
          </div>
          <a
            className={styles.linkButton}
            href="/client/login"
            style={{ marginTop: "1.25rem" }}
          >
            Войти в портал
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <Logo size="auth" />
        </div>
        <h1 className={styles.title}>Новый пароль</h1>
        <p className={styles.subtitle}>
          Задайте новый пароль для клиентского портала {BRAND_NAME}.
        </p>
        {state.error ? (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        ) : null}
        <form className={styles.form} action={formAction}>
          <input type="hidden" name="token" value={token} />
          <label className={styles.label}>
            Новый пароль
            <input
              className={styles.input}
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={8}
              required
              disabled={pending}
            />
          </label>
          <label className={styles.label}>
            Повторите пароль
            <input
              className={styles.input}
              type="password"
              name="passwordConfirm"
              autoComplete="new-password"
              minLength={8}
              required
              disabled={pending}
            />
          </label>
          <button className={styles.submit} type="submit" disabled={pending}>
            {pending ? "Сохранение…" : "Сохранить пароль"}
          </button>
        </form>
      </div>
    </div>
  );
}
