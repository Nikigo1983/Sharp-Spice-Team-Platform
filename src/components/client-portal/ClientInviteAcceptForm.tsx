"use client";

import { useActionState } from "react";
import {
  clientAcceptInviteAction,
  type ClientAuthState,
} from "@/app/client/actions";
import { ClientLocaleSwitcher } from "@/components/client-portal/ClientLocaleSwitcher";
import { EmigrantLogo } from "@/components/client-portal/EmigrantLogo";
import { CLIENT_PORTAL_BRAND_NAME } from "@/lib/client-portal/brand";
import { t } from "@/lib/client-portal/portal-i18n";
import type { ClientPortalLocale } from "@/lib/client-portal/types";
import styles from "./ClientPortal.module.css";

const initialState: ClientAuthState = {};

type Props = {
  token: string;
  email: string;
  firstName: string;
  locale: ClientPortalLocale;
  invalid?: boolean;
};

export function ClientInviteAcceptForm({
  token,
  email,
  firstName,
  locale,
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
            <EmigrantLogo size="auth" priority />
          </div>
          <ClientLocaleSwitcher locale={locale} variant="auth" />
          <h1 className={styles.title}>{t("inviteUsed", locale)}</h1>
          <p className={styles.subtitle}>
            {locale === "en"
              ? `The link is invalid or already used. Ask your ${CLIENT_PORTAL_BRAND_NAME} manager for a new invitation.`
              : `Ссылка недействительна или уже использована. Запросите новое приглашение у менеджера ${CLIENT_PORTAL_BRAND_NAME}.`}
          </p>
          <a className={styles.linkButton} href="/client/login">
            {t("backToLogin", locale)}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <EmigrantLogo size="auth" priority />
        </div>
        <ClientLocaleSwitcher locale={locale} variant="auth" />
        <h1 className={styles.title}>
          {locale === "en"
            ? `Welcome, ${firstName}`
            : `Добро пожаловать, ${firstName}`}
        </h1>
        <p className={styles.subtitle}>
          {locale === "en"
            ? `Create a password for the ${CLIENT_PORTAL_BRAND_NAME} client portal. Email: `
            : `Создайте пароль для клиентского портала ${CLIENT_PORTAL_BRAND_NAME}. Email: `}
          <strong>{email}</strong>
        </p>
        {state.error ? (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        ) : null}
        <form className={styles.form} action={formAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="locale" value={locale} />
          <label className={styles.label}>
            {t("password", locale)}
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
            {t("confirmPassword", locale)}
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
            {pending ? t("creating", locale) : t("createAccount", locale)}
          </button>
        </form>
      </div>
    </div>
  );
}
