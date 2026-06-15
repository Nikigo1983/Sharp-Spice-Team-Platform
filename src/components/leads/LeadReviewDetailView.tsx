"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LeadReviewStatusBadge } from "@/components/leads/LeadReviewStatusBadge";
import type {
  LeadDetail,
  LeadDuplicateMatch,
  LeadReviewAction,
} from "@/lib/leads/lead-review-types";
import styles from "./LeadReviewQueue.module.css";

function MatchBlock({
  title,
  matches,
}: {
  title: string;
  matches: LeadDuplicateMatch[];
}) {
  if (matches.length === 0) {
    return (
      <div>
        <h3 className={styles.panelTitle}>{title}</h3>
        <p className={styles.fieldValue}>Совпадений не найдено.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className={styles.panelTitle}>{title}</h3>
      <ul className={styles.matchList}>
        {matches.map((match) => (
          <li
            key={`${match.source}-${match.sheetRow ?? match.clientId}-${match.name}`}
            className={styles.matchItem}
          >
            <strong>{match.name}</strong>
            <div className={styles.matchMeta}>
              {match.source === "crm" ? "CRM" : "Formgrid"}
              {match.sheetRow ? ` · строка ${match.sheetRow}` : ""}
              {match.clientId ? ` · id ${match.clientId}` : ""}
            </div>
            {match.reasons.length > 0 ? (
              <div className={styles.matchMeta}>
                Совпадение: {match.reasons.join(", ")}
              </div>
            ) : null}
            {match.possibleReasons && match.possibleReasons.length > 0 ? (
              <div className={styles.matchMeta}>
                Возможно: {match.possibleReasons.join(", ")}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LeadReviewDetailView({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
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

  async function runAction(action: LeadReviewAction) {
    if (!lead || acting) return;
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("patch failed");
      const data = (await res.json()) as { lead?: LeadDetail };
      setLead(data.lead ?? null);
    } catch {
      setError("Не удалось выполнить действие");
    } finally {
      setActing(false);
    }
  }

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

  const crmStrong = lead.dedup.strongMatches.filter((m) => m.source === "crm");
  const fgStrong = lead.dedup.strongMatches.filter(
    (m) => m.source === "formgrid",
  );
  const crmPossible = lead.dedup.possibleMatches.filter(
    (m) => m.source === "crm",
  );
  const fgPossible = lead.dedup.possibleMatches.filter(
    (m) => m.source === "formgrid",
  );

  const actionsDisabled =
    acting ||
    lead.reviewStatus === "created_in_crm" ||
    lead.reviewStatus === "rejected";

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

      {lead.dedup.hasStrongMatch ? (
        <div className={styles.alertStrong}>
          <i className="fa-solid fa-triangle-exclamation" aria-hidden />
          <div>
            <strong>Возможный дубликат</strong>
            <div>
              Найдено надёжное совпадение (
              {lead.dedup.strongMatches
                .flatMap((m) => m.reasons)
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(", ") || "идентификатор"}
              ). Проверьте перед созданием клиента в CRM.
            </div>
          </div>
        </div>
      ) : null}

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

        <div className={styles.wrap}>
          <Card className={styles.panel}>
            <h2 className={styles.panelTitle}>Проверка дублей</h2>
            <MatchBlock title="CRM — надёжные совпадения" matches={crmStrong} />
            <MatchBlock
              title="Formgrid — надёжные совпадения"
              matches={fgStrong}
            />
            <MatchBlock
              title="CRM — возможные совпадения"
              matches={crmPossible}
            />
            <MatchBlock
              title="Formgrid — возможные совпадения"
              matches={fgPossible}
            />
          </Card>

          <Card className={styles.panel}>
            <h2 className={styles.panelTitle}>Действия</h2>
            <div className={styles.actions}>
              <Button
                type="button"
                disabled={actionsDisabled}
                onClick={() => void runAction("create_in_crm")}
              >
                Создать клиента в CRM
              </Button>
              <Button
                type="button"
                disabled={acting || lead.reviewStatus === "duplicate"}
                onClick={() => void runAction("mark_duplicate")}
              >
                Пометить как дубликат
              </Button>
              <Button
                type="button"
                disabled={acting || lead.reviewStatus === "rejected"}
                onClick={() => void runAction("reject")}
              >
                Отклонить
              </Button>
              <Button
                type="button"
                disabled={acting || lead.reviewStatus === "reviewed"}
                onClick={() => void runAction("mark_reviewed")}
              >
                Пометить проверенным
              </Button>
            </div>

            {lead.review?.note ? (
              <div className={styles.noteBox}>{lead.review.note}</div>
            ) : null}

            {lead.reviewStatus === "created_in_crm" &&
            lead.review?.pendingCrmClientId ? (
              <div className={styles.noteBox}>
                Планируемый CRM id: {lead.review.pendingCrmClientId}
              </div>
            ) : null}

            {error ? <div className={styles.noteBox}>{error}</div> : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
