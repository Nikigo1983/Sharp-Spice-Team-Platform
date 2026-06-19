import Link from "next/link";
import type { ClientDetail } from "@/lib/google-sheets/types";
import { getClientSheetFields } from "@/lib/google-sheets/client-detail-fields";
import { Card } from "@/components/ui/Card";
import { ClientAiActions } from "./ClientAiPanel";
import { ClientNotes } from "./ClientNotes";
import styles from "./ClientDetailView.module.css";

type ClientDetailViewProps = {
  detail: ClientDetail;
};

export function ClientDetailView({ detail }: ClientDetailViewProps) {
  const { client, surveys, documents, notes } = detail;
  const sheetFields = getClientSheetFields(client);

  return (
    <div className={styles.page}>
      <Link href="/clients" className={styles.back}>
        <i className="fa-solid fa-arrow-left" aria-hidden /> К списку клиентов
      </Link>

      <div className={styles.summary}>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>ФИО</span>
          <span className={styles.fieldValue}>{client.name}</span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Паспорт</span>
          <span className={styles.fieldValue}>
            {client.passportNumber ?? client.id}
          </span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Статус</span>
          <span className={styles.fieldValue}>
            <span className={styles.statusBadge}>{client.status}</span>
          </span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Источник</span>
          <span className={styles.fieldValue}>
            {detail.source === "google_sheets" ? "Google Sheets" : "Демо"}
            {client.rowIndex ? ` · строка ${client.rowIndex}` : null}
          </span>
        </div>
      </div>

      <div className={styles.detailLayout}>
        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Данные из таблицы</h2>
          <div className={styles.fieldGrid}>
            {sheetFields.map((field) => (
              <div key={field.label} className={styles.fieldRow}>
                <span className={styles.fieldLabel}>{field.label}</span>
                <span className={styles.fieldValue}>{field.value}</span>
              </div>
            ))}
          </div>
        </Card>

        {surveys.length > 0 ? (
          <Card className={styles.panel}>
            <h2 className={styles.panelTitle}>Анкеты</h2>
            <ul className={styles.itemList}>
              {surveys.map((s) => (
                <li key={s.id} className={styles.item}>
                  <span className={styles.itemTitle}>{s.title}</span>
                  <span className={styles.itemMeta}>
                    {s.filledAt} · {s.processingStatus}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {documents.length > 0 ? (
          <Card className={styles.panel}>
            <h2 className={styles.panelTitle}>Документы</h2>
            <ul className={styles.itemList}>
              {documents.map((d) => (
                <li key={d.id} className={styles.item}>
                  <span className={styles.itemTitle}>{d.name}</span>
                  <span className={styles.itemMeta}>
                    {d.category} · {d.uploadedAt}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      <ClientAiActions clientId={client.id} clientName={client.name} />

      <Card className={styles.panelWide}>
        <h2 className={styles.panelTitle}>Заметки менеджеров</h2>
        <ClientNotes clientId={client.id} initialNotes={notes} />
      </Card>
    </div>
  );
}
