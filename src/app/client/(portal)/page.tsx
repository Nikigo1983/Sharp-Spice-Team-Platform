import Link from "next/link";
import { redirect } from "next/navigation";
import { clientSignOutAction } from "@/app/client/actions";
import styles from "@/components/client-portal/ClientPortal.module.css";
import { BRAND_NAME } from "@/lib/brand";
import {
  calculateProgress,
  getOrCreateQuestionnaire,
} from "@/lib/client-portal/questionnaire-service";
import { getClientSession } from "@/lib/client-portal/session";

export default async function ClientPortalHomePage() {
  const session = await getClientSession();
  if (!session) {
    redirect("/client/login");
  }

  const questionnaire = await getOrCreateQuestionnaire(session);
  const progress = calculateProgress(questionnaire.answers);
  const submitted = questionnaire.status === "submitted";

  return (
    <div className={styles.portalPage}>
      <header className={styles.portalHeader}>
        <div className={styles.portalHeaderText}>
          <h1 className={styles.portalTitle}>
            Здравствуйте, {session.firstName}
          </h1>
          <p className={styles.portalLead}>
            Вас приветствует Клиентский портал {BRAND_NAME}.
            <br />
            Это ваш личный кабинет.
          </p>
        </div>
        <form action={clientSignOutAction} className={styles.signOutForm}>
          <button type="submit" className={styles.signOut}>
            Выйти
          </button>
        </form>
      </header>

      <section className={styles.portalCard}>
        <h2>Анкета</h2>
        <p>
          {submitted
            ? "Анкета отправлена. Вы можете просмотреть ответы."
            : `Заполните анкету онбординга. Прогресс: ${progress}%.`}
        </p>
        <Link
          href="/client/questionnaire"
          className={styles.linkButton}
          style={{ marginTop: "0.85rem", width: "fit-content" }}
        >
          {submitted ? "Открыть анкету" : "Продолжить анкету"}
        </Link>
      </section>

      <section className={styles.portalCard}>
        <h2>Договор и подпись</h2>
        <p>Консультационный договор и подпись появятся после анкеты.</p>
        <span className={styles.comingSoon}>Скоро</span>
      </section>

      <section className={styles.portalCard}>
        <h2>Ассистент</h2>
        <p>Клиентский AI-ассистент подключим после базового кабинета.</p>
        <span className={styles.comingSoon}>Скоро</span>
      </section>
    </div>
  );
}
