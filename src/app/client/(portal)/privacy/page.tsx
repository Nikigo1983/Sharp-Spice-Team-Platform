import Link from "next/link";
import styles from "@/components/client-portal/ClientPortal.module.css";
import { BRAND_NAME } from "@/lib/brand";

export default function ClientPrivacyPage() {
  return (
    <div className={styles.portalPage}>
      <h1 className={styles.portalTitle}>Политика конфиденциальности</h1>
      <p className={styles.portalLead}>
        {BRAND_NAME} обрабатывает персональные данные, которые вы указываете в
        клиентской анкете, только для оказания услуг по релокации и связанных
        консультаций. Данные не передаются третьим лицам без правовой основы или
        вашего согласия, за исключением случаев, когда это требуется для
        подготовки документов и взаимодействия с госорганами по вашему поручению.
      </p>
      <p className={styles.portalLead}>
        Полный текст политики можно запросить у вашей команды сопровождения.
        Продолжая заполнение анкеты, вы подтверждаете согласие на обработку
        указанных данных.
      </p>
      <Link
        href="/client/questionnaire"
        className={styles.linkButton}
        style={{ marginTop: "1rem", width: "fit-content" }}
      >
        Вернуться к анкете
      </Link>
    </div>
  );
}
