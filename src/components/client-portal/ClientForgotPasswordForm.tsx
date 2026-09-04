"use client";

import { useActionState } from "react";
import {
  clientForgotPasswordAction,
  type ClientAuthState,
} from "@/app/client/actions";
import { Logo } from "@/components/ui/Logo";
import { BRAND_NAME } from "@/lib/brand";
import styles from "./ClientPortal.module.css";

const initialState: ClientAuthState = {};

export function ClientForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    clientForgotPasswordAction,
    initialState,
  );

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <Logo size="md" />
        </div>
        <h1 className={styles.title}>Забыли пароль?</h1>
        <p className={styles.subtitle}>
          Укажите email аккаунта клиентского портала {BRAND_NAME}. Если он есть
          в системе, мы отправим ссылку для сброса пароля.
        </p>
        {state.error ? (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className={styles.statusOk} role="status">
            Если аккаунт найден, письмо со ссылкой отправлено. Проверьте почту.
          </p>
        ) : (
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
            <button className={styles.submit} type="submit" disabled={pending}>
              {pending ? "Отправка…" : "Отправить ссылку"}
            </button>
          </form>
        )}
        <p className={styles.hint}>
          <a className={styles.forgotLink} href="/client/login">
            Вернуться ко входу
          </a>
        </p>
      </div>
    </div>
  );
}
