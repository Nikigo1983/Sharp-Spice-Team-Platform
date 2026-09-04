"use client";

import { useActionState } from "react";
import {
  clientAcceptInviteAction,
  type ClientAuthState,
} from "@/app/client/actions";
import { Logo } from "@/components/ui/Logo";
import { BRAND_NAME } from "@/lib/brand";
import styles from "./ClientPortal.module.css";

const initialState: ClientAuthState = {};

type Props = {
  token: string;
  email: string;
  firstName: string;
  invalid?: boolean;
};

export function ClientInviteAcceptForm({
  token,
  email,
  firstName,
  invalid = false,
}: Props) {
  const [state, formAction, pending] = useActionState(
    clientAcceptInviteAction,
    initialState,
  );

  if (invalid) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logoWrap}>
            <Logo size="md" />
          </div>
          <h1 className={styles.title}>Приглашение недоступно</h1>
          <p className={styles.subtitle}>
            Ссылка недействительна или уже использована. Запросите новое
            приглашение у менеджера {BRAND_NAME}.
          </p>
          <a className={styles.linkButton} href="/client/login">
            Перейти ко входу
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <Logo size="md" />
        </div>
        <h1 className={styles.title}>Добро пожаловать, {firstName}</h1>
        <p className={styles.subtitle}>
          Создайте пароль для клиентского портала {BRAND_NAME}. Email:{" "}
          <strong>{email}</strong>
        </p>
        {state.error ? (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        ) : null}
        <form className={styles.form} action={formAction}>
          <input type="hidden" name="token" value={token} />
          <label className={styles.label}>
            Пароль
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
            {pending ? "Создание…" : "Создать аккаунт"}
          </button>
        </form>
      </div>
    </div>
  );
}
