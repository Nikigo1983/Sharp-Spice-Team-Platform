import Link from "next/link";
import { redirect } from "next/navigation";
import { clientSignOutAction } from "@/app/client/actions";
import { ClientLocaleSwitcher } from "@/components/client-portal/ClientLocaleSwitcher";
import { EmigrantLogo } from "@/components/client-portal/EmigrantLogo";
import styles from "@/components/client-portal/ClientPortal.module.css";
import { CLIENT_PORTAL_BRAND_NAME } from "@/lib/client-portal/brand";
import {
  t,
  translateProcessStatus,
} from "@/lib/client-portal/portal-i18n";
import {
  calculateProgress,
  getOrCreateQuestionnaire,
  getSchemaForRecord,
  readProcessStatus,
} from "@/lib/client-portal/questionnaire-service";
import { getClientSession } from "@/lib/client-portal/session";
import { needsVnzhCountrySelection } from "@/lib/client-portal/questionnaire-templates";

export default async function ClientPortalHomePage() {
  const session = await getClientSession();
  if (!session) {
    redirect("/client/login");
  }

  const locale = session.preferredLocale;
  const questionnaire = await getOrCreateQuestionnaire(session);
  const needsCountry = needsVnzhCountrySelection(questionnaire);
  const progress = needsCountry
    ? 0
    : calculateProgress(
        questionnaire.answers,
        getSchemaForRecord(questionnaire),
      );
  const submitted = questionnaire.status === "submitted";
  const processStatus = submitted
    ? readProcessStatus(questionnaire.answers, questionnaire.status)
    : null;

  return (
    <div className={styles.portalPage}>
      <header className={styles.portalHeader}>
        <div className={styles.portalHeaderText}>
          <div style={{ marginBottom: "1rem" }}>
            <EmigrantLogo size="md" href="/client" />
          </div>
          <h1 className={styles.portalTitle}>
            {t("hello", locale, { name: session.firstName })}
          </h1>
          <p className={styles.portalLead}>
            {t("welcomeLead", locale, { brand: CLIENT_PORTAL_BRAND_NAME })}
            <br />
            {t("welcomeLead2", locale)}
          </p>
        </div>
        <div className={styles.portalHeaderActions}>
          <ClientLocaleSwitcher locale={locale} />
          <form action={clientSignOutAction} className={styles.signOutForm}>
            <button type="submit" className={styles.signOut}>
              {t("signOut", locale)}
            </button>
          </form>
        </div>
      </header>

      <section className={styles.portalCard}>
        <h2>{t("questionnaire", locale)}</h2>
        <p>
          {submitted
            ? t("questionnaireSubmitted", locale)
            : needsCountry
              ? t("questionnairePickCountry", locale)
              : t("questionnaireProgress", locale, { progress })}
        </p>
        <Link
          href="/client/questionnaire"
          className={styles.linkButton}
          style={{ marginTop: "0.85rem", width: "fit-content" }}
        >
          {submitted
            ? t("openQuestionnaire", locale)
            : needsCountry || progress === 0
              ? t("startQuestionnaire", locale)
              : t("continueQuestionnaire", locale)}
        </Link>
      </section>

      {processStatus ? (
        <section className={styles.portalCard}>
          <h2>{t("processStatus", locale)}</h2>
          <p className={styles.statusLabel}>{t("processStatusLabel", locale)}</p>
          <p className={styles.statusValue}>
            {translateProcessStatus(processStatus.value, locale)}
          </p>
          {processStatus.updatedAt ? (
            <p className={styles.statusUpdated}>
              {t("updated", locale)}{" "}
              {new Date(processStatus.updatedAt).toLocaleString(
                locale === "en" ? "en-GB" : "ru-RU",
              )}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className={styles.portalCard}>
        <h2>{t("assistant", locale)}</h2>
        <p>{t("assistantSoon", locale)}</p>
        <span className={styles.comingSoon}>{t("comingSoon", locale)}</span>
      </section>
    </div>
  );
}
