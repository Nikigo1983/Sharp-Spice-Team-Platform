"use client";

import { useActionState } from "react";
import {
  clientSignInAction,
  type ClientAuthState,
} from "@/app/client/actions";
import { ClientLocaleSwitcher } from "@/components/client-portal/ClientLocaleSwitcher";
import { EmigrantLogo } from "@/components/client-portal/EmigrantLogo";
import { CLIENT_PORTAL_BRAND_NAME } from "@/lib/client-portal/brand";
import { t } from "@/lib/client-portal/portal-i18n";
import type { ClientPortalLocale } from "@/lib/client-portal/types";
import styles from "./ClientPortal.module.css";

const initialState: ClientAuthState = {};

export function ClientPortalLoginForm({
  locale,
}: {
  locale: ClientPortalLocale;
}) {
  const [state, formAction, pending] = useActionState(
    clientSignInAction,
    initialState,
  );

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <EmigrantLogo size="auth" priority />
        </div>
        <ClientLocaleSwitcher locale={locale} variant="auth" />
        <h1 className={styles.title}>{t("portalTitle", locale)}</h1>
        <p className={styles.subtitle}>
          {t("portalLoginSubtitle", locale, { brand: CLIENT_PORTAL_BRAND_NAME })}
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
          <label className={styles.label}>
            {t("password", locale)}
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
            {pending ? t("signingIn", locale) : t("signIn", locale)}
          </button>
        </form>
        <p className={styles.hint}>
          <a className={styles.forgotLink} href="/client/forgot-password">
            {t("forgotPassword", locale)}
          </a>
        </p>
        <p className={styles.hint}>{t("noAccount", locale)}</p>
      </div>
    </div>
  );
}
