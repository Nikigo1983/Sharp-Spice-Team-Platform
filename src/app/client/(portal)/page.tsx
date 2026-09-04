import { redirect } from "next/navigation";
import { clientSignOutAction } from "@/app/client/actions";
import styles from "@/components/client-portal/ClientPortal.module.css";
import { BRAND_NAME } from "@/lib/brand";
import { getClientSession } from "@/lib/client-portal/session";

export default async function ClientPortalHomePage() {
  const session = await getClientSession();
  if (!session) {
    redirect("/client/login");
  }

  return (
    <div className={styles.portalPage}>
      <header className={styles.portalHeader}>
        <div>
          <h1 className={styles.portalTitle}>
            Здравствуйте, {session.firstName}
          </h1>
          <p className={styles.portalLead}>
            Клиентский портал {BRAND_NAME}. Дальше здесь появятся анкета, договор
            и ассистент — как в Spiora.
          </p>
        </div>
        <form action={clientSignOutAction}>
          <button type="submit" className={styles.signOut}>
            Выйти
          </button>
        </form>
      </header>

      <section className={styles.portalCard}>
        <h2>Анкета</h2>
        <p>Раздел анкеты будет добавлен на следующем этапе.</p>
        <span className={styles.comingSoon}>Скоро</span>
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
