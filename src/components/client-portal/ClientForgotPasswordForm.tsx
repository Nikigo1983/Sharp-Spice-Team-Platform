"use client";

import { useActionState } from "react";
import {
  clientForgotPasswordAction,
  type ClientAuthState,
} from "@/app/client/actions";
import { ClientLocaleSwitcher } from "@/components/client-portal/ClientLocaleSwitcher";
import { EmigrantLogo } from "@/components/client-portal/EmigrantLogo";
import { CLIENT_PORTAL_BRAND_NAME } from "@/lib/client-portal/brand";
import { t } from "@/lib/client-portal/portal-i18n";
import type { ClientPortalLocale } from "@/lib/client-portal/types";
import styles from "./ClientPortal.module.css";

const initialState: ClientAuthState = {};

export function ClientForgotPasswordForm({
  locale,
}: {
  locale: ClientPortalLocale;
}) {
  const [state, formAction, pending] = useActionState(
    clientForgotPasswordAction,
    initialState,
  );

  if (state.ok) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logoWrap}>
            <EmigrantLogo size="auth" priority />
          </div>
          <ClientLocaleSwitcher locale={locale} variant="auth" />
          <h1 className={styles.title}>{t("mailSentTitle", locale)}</h1>
          <div className={styles.statusOk} role="status">
            <p className={styles.statusOkHint}>{t("mailSentBody", locale)}</p>
          </div>
          <p className={styles.hint}>
            <a className={styles.forgotLink} href="/client/login">
              {t("backToLogin", locale)}
            </a>
          </p>
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
        <h1 className={styles.title}>{t("forgotTitle", locale)}</h1>
        <p className={styles.subtitle}>
          {t("forgotSubtitle", locale, { brand: CLIENT_PORTAL_BRAND_NAME })}
        </p>
        {state.error ? (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        ) : null}
        <form className={styles.form} action={formAction}>
          <input type="hidden" name="locale" value={locale} />
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
            {pending ? t("sending", locale) : t("sendLink", locale)}
          </button>
        </form>
        <p className={styles.hint}>
          <a className={styles.forgotLink} href="/client/login">
            {t("backToLogin", locale)}
          </a>
        </p>
      </div>
    </div>
  );
}
