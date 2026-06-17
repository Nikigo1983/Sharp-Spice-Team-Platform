"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LeadReviewStatusBadge } from "@/components/leads/LeadReviewStatusBadge";
import type { LeadDetail } from "@/lib/leads/lead-review-types";
import styles from "./LeadReviewQueue.module.css";

export function LeadReviewDetailView({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLead = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as { lead?: LeadDetail };
      setLead(data.lead ?? null);
    } catch {
      setLead(null);
      setError("Не удалось загрузить лид");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void fetchLead();
  }, [fetchLead]);

  if (loading) {
    return <p className={styles.meta}>Загрузка лида…</p>;
  }

  if (!lead) {
    return (
      <div>
        <p className={styles.empty}>{error ?? "Лид не найден"}</p>
        <Link href="/crm/leads" className={styles.backLink}>
          <i className="fa-solid fa-arrow-left" /> К очереди
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <Link href="/crm/leads" className={styles.backLink}>
        <i className="fa-solid fa-arrow-left" /> Lead Review Queue
      </Link>

      <div className={styles.fieldGrid} style={{ marginBottom: "0.75rem" }}>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>ФИО</span>
          <span className={styles.fieldValue}>{lead.name}</span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Статус проверки</span>
          <span className={styles.fieldValue}>
            <LeadReviewStatusBadge status={lead.reviewStatus} />
          </span>
        </div>
      </div>

      <div className={styles.detailLayout}>
        <Card className={styles.panel}>
          <h2 className={styles.panelTitle}>Данные анкеты</h2>
          <div className={styles.fieldGrid}>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Паспорт</span>
              <span className={styles.fieldValue}>{lead.passport || "—"}</span>
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Телефон</span>
              <span className={styles.fieldValue}>{lead.phone || "—"}</span>
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Email</span>
              <span className={styles.fieldValue}>{lead.email || "—"}</span>
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Дата анкеты</span>
              <span className={styles.fieldValue}>
                {lead.submittedAt || "—"}
              </span>
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Источник</span>
              <span className={styles.fieldValue}>{lead.source}</span>
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Строка Formgrid</span>
              <span className={styles.fieldValue}>{lead.sheetRow}</span>
            </div>
          </div>

          <h3 className={styles.panelTitle} style={{ marginTop: "1.25rem" }}>
            Полная анкета
          </h3>
          <div className={styles.surveyList}>
            {lead.surveyFields.map((field) => (
              <div key={field.label} className={styles.fieldRow}>
                <span className={styles.fieldLabel}>{field.label}</span>
                <span className={styles.fieldValue}>{field.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
