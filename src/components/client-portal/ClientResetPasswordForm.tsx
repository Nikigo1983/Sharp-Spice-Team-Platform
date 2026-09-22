"use client";

import { useActionState } from "react";
import {
  clientResetPasswordAction,
  type ClientAuthState,
} from "@/app/client/actions";
import { ClientLocaleSwitcher } from "@/components/client-portal/ClientLocaleSwitcher";
import { EmigrantLogo } from "@/components/client-portal/EmigrantLogo";
import { CLIENT_PORTAL_BRAND_NAME } from "@/lib/client-portal/brand";
import { t } from "@/lib/client-portal/portal-i18n";
import type { ClientPortalLocale } from "@/lib/client-portal/types";
import styles from "./ClientPortal.module.css";

const initialState: ClientAuthState = {};

export function ClientResetPasswordForm({
  token,
  locale,
}: {
  token: string;
  locale: ClientPortalLocale;
}) {
  const [state, formAction, pending] = useActionState(
    clientResetPasswordAction,
    initialState,
  );

  if (!token) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logoWrap}>
            <EmigrantLogo size="auth" priority />
          </div>
          <ClientLocaleSwitcher locale={locale} variant="auth" />
          <h1 className={styles.title}>{t("invalidResetLink", locale)}</h1>
          <p className={styles.subtitle}>{t("requestNewReset", locale)}</p>
          <a className={styles.linkButton} href="/client/forgot-password">
            {t("forgotPassword", locale)}
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
            <EmigrantLogo size="auth" priority />
          </div>
          <ClientLocaleSwitcher locale={locale} variant="auth" />
          <h1 className={styles.title}>{t("passwordChangedTitle", locale)}</h1>
          <div className={styles.statusOk} role="status">
            <p className={styles.statusOkHint}>
              {t("passwordChangedBody", locale)}
            </p>
          </div>
          <a
            className={styles.linkButton}
            href="/client/login"
            style={{ marginTop: "1.25rem" }}
          >
            {t("loginToPortal", locale)}
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
        <h1 className={styles.title}>{t("resetTitle", locale)}</h1>
        <p className={styles.subtitle}>
          {t("resetSubtitle", locale, { brand: CLIENT_PORTAL_BRAND_NAME })}
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
            {t("newPassword", locale)}
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
            {pending ? t("saving", locale) : t("savePassword", locale)}
          </button>
        </form>
      </div>
    </div>
  );
}
