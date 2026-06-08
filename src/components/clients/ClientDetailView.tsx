import Link from "next/link";
import type { ClientDetail } from "@/lib/google-sheets/types";
import { Card } from "@/components/ui/Card";
import { ClientAiActions } from "./ClientAiPanel";
import { ClientNotes } from "./ClientNotes";
import styles from "./ClientDetailView.module.css";

type ClientDetailViewProps = {
  detail: ClientDetail;
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>{value}</span>
    </div>
  );
}

export function ClientDetailView({ detail }: ClientDetailViewProps) {
  const { client, surveys, documents, notes } = detail;

  return (
    <div className={styles.page}>
      <Link href="/clients" className={styles.back}>
        <i className="fa-solid fa-arrow-left" aria-hidden /> К списку клиентов
      </Link>

      <header className={styles.header}>
        <div>
          <h1 className={styles.name}>{client.name}</h1>
          <p className={styles.meta}>
            {client.id} · {client.direction} · {client.status}
            <span className={styles.source}>
              {detail.source === "google_sheets"
                ? "Google Sheets"
                : "Демо"}
            </span>
          </p>
        </div>
      </header>

      <ClientAiActions clientId={client.id} clientName={client.name} />

      <div className={styles.grid}>
        <Card className={styles.block}>
          <h2 className={styles.blockTitle}>Основная информация</h2>
          <InfoRow label="Имя" value={client.name} />
          <InfoRow label="Телефон" value={client.phone} />
          <InfoRow label="Email" value={client.email} />
          <InfoRow label="Страна" value={client.country} />
          <InfoRow label="Гражданство" value={client.citizenship} />
          <InfoRow label="Направление" value={client.direction} />
          <InfoRow label="Статус" value={client.status} />
          <InfoRow label="Менеджер" value={client.manager} />
          <InfoRow label="Дата создания" value={client.createdAt} />
          <InfoRow label="Последняя активность" value={client.lastActivity} />
        </Card>

        <Card className={styles.block}>
          <h2 className={styles.blockTitle}>Анкеты</h2>
          {surveys.length === 0 ? (
            <p className={styles.empty}>Анкеты не найдены</p>
          ) : (
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
          )}
        </Card>

        <Card className={styles.block}>
          <h2 className={styles.blockTitle}>Документы</h2>
          {documents.length === 0 ? (
            <p className={styles.empty}>Документы не загружены</p>
          ) : (
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
          )}
        </Card>

        <Card className={styles.blockWide}>
          <h2 className={styles.blockTitle}>Заметки менеджеров</h2>
          <ClientNotes clientId={client.id} initialNotes={notes} />
        </Card>
      </div>
    </div>
  );
}
