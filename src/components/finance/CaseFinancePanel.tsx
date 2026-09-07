"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  formatDateKeyRu,
  parseFlexibleDateKey,
} from "@/lib/calendar/datetime-input";
import type { FinanceClientDetail } from "@/lib/finance/types";
import type { FinancePaymentStatus } from "@/lib/finance/calculations";
import { financeDirectionLabelRu } from "@/lib/finance/directions";
import { formatEuroFromCents } from "@/lib/finance/money";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import styles from "./CaseFinancePanel.module.css";

type Props = {
  caseId: string;
  /** Show client header + link back to finance list / intake */
  showHeader?: boolean;
};

type ModalKind =
  | { type: "changeAmount" }
  | { type: "changeDate" }
  | { type: "addPayment" }
  | { type: "void"; paymentId: string };

const STATUS_LABELS: Record<FinancePaymentStatus, string> = {
  no_contract: "Нет договора",
  unpaid: "Не оплачено",
  partial: "Частично",
  paid: "Оплачено",
  overpaid: "Переплата",
};

function fmt(cents: number | null | undefined) {
  return formatEuroFromCents(cents, "ru");
}

export function CaseFinancePanel({ caseId, showHeader = false }: Props) {
  const [data, setData] = useState<FinanceClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState<ModalKind | null>(null);

  const [newAmount, setNewAmount] = useState("");
  const [newDate, setNewDate] = useState("");

  const [modalAmount, setModalAmount] = useState("");
  const [modalDate, setModalDate] = useState("");
  const [modalComment, setModalComment] = useState("");
  const [modalReason, setModalReason] = useState("");

  const basePath = `/api/finance/cases/${encodeURIComponent(caseId)}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(basePath);
      const json = (await res.json()) as {
        finance?: FinanceClientDetail;
        error?: string;
      };
      if (!res.ok || !json.finance) {
        setData(null);
        setError(json.error ?? "Не удалось загрузить финансы.");
        return;
      }
      setData(json.finance);
    } catch {
      setData(null);
      setError("Не удалось загрузить финансы.");
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const resetModal = () => {
    setModal(null);
    setModalAmount("");
    setModalDate("");
    setModalComment("");
    setModalReason("");
  };

  const handleCreateContract = async () => {
    if (!newAmount.trim() || !newDate.trim()) return;
    const contractDate = parseFlexibleDateKey(newDate);
    if (!contractDate) {
      setError("Некорректная дата. Используйте ДД.ММ.ГГГГ.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: newAmount, contractDate }),
      });
      const json = (await res.json()) as {
        finance?: FinanceClientDetail;
        error?: string;
      };
      if (!res.ok || !json.finance) {
        setError(json.error ?? "Не удалось сохранить.");
        return;
      }
      setData(json.finance);
      setNewAmount("");
      setNewDate("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleContractChange = async () => {
    if (!modal || !data?.profile || !modalReason.trim()) return;
    const body: Record<string, unknown> = {
      expectedVersion: data.profile.version,
      reason: modalReason.trim(),
    };
    if (modal.type === "changeAmount") {
      if (!modalAmount.trim()) return;
      body.amount = modalAmount;
    } else if (modal.type === "changeDate") {
      if (!modalDate.trim()) return;
      const contractDate = parseFlexibleDateKey(modalDate);
      if (!contractDate) {
        setError("Некорректная дата. Используйте ДД.ММ.ГГГГ.");
        return;
      }
      body.contractDate = contractDate;
    } else {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/contract/change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        finance?: FinanceClientDetail;
        error?: string;
      };
      if (!res.ok || !json.finance) {
        setError(json.error ?? "Не удалось сохранить.");
        return;
      }
      setData(json.finance);
      resetModal();
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddPayment = async () => {
    if (!modalAmount.trim() || !modalDate.trim()) return;
    const paymentDate = parseFlexibleDateKey(modalDate);
    if (!paymentDate) {
      setError("Некорректная дата. Используйте ДД.ММ.ГГГГ.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          amount: modalAmount,
          paymentDate,
          comment: modalComment.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        finance?: FinanceClientDetail;
        error?: string;
      };
      if (!res.ok || !json.finance) {
        setError(json.error ?? "Не удалось сохранить.");
        return;
      }
      setData(json.finance);
      resetModal();
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoid = async () => {
    if (!modal || modal.type !== "void" || !modalReason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/payments/${modal.paymentId}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: modalReason.trim() }),
      });
      const json = (await res.json()) as {
        finance?: FinanceClientDetail;
        error?: string;
      };
      if (!res.ok || !json.finance) {
        setError(json.error ?? "Не удалось сохранить.");
        return;
      }
      setData(json.finance);
      resetModal();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <p className={styles.loading} aria-busy="true">
        Загрузка финансов…
      </p>
    );
  }

  if (!data) {
    return (
      <p className={styles.loading}>{error ?? "Данные недоступны."}</p>
    );
  }

  const { profile, summary, payments, direction } = data;
  const directionLabel = financeDirectionLabelRu(direction);
  const hasContract = profile != null && profile.contractAmountCents != null;
  const activePayments = payments.filter((p) => !p.voidedAt);
  const voidedPayments = payments.filter((p) => p.voidedAt);

  return (
    <div className={styles.wrap}>
      {showHeader ? (
        <div className={styles.detailHead}>
          <div>
            <Link href="/finance" className={styles.backLink}>
              ← К списку финансов
            </Link>
            <h1 className={styles.detailTitle}>{data.clientName}</h1>
            <p className={styles.detailMeta}>
              {data.clientEmail} · {directionLabel}
            </p>
          </div>
          <Link
            href={`/clients/intake?id=${encodeURIComponent(caseId)}`}
            className={styles.intakeLink}
          >
            К заявке Emigrant
          </Link>
        </div>
      ) : (
        <div className={styles.detailHead}>
          <h2 className={styles.panelTitle} style={{ margin: 0 }}>
            Финансы
          </h2>
          <Link
            href={`/finance/${encodeURIComponent(caseId)}`}
            className={styles.intakeLink}
          >
            Открыть в разделе «Финансы»
          </Link>
        </div>
      )}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Договор</h2>
        <p className={styles.statusLine}>
          {STATUS_LABELS[summary.paymentStatus]}
        </p>

        {hasContract && profile ? (
          <>
            <div className={styles.fieldGrid}>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>Сумма договора</span>
                <span className={styles.fieldValue}>
                  {fmt(profile.contractAmountCents)}
                </span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>Дата договора</span>
                <span className={styles.fieldValue}>
                  {profile.contractDate
                    ? formatDateKeyRu(profile.contractDate)
                    : "—"}
                </span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>Направление</span>
                <span className={styles.fieldValue}>{directionLabel}</span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>Оплачено</span>
                <span className={styles.fieldValue}>
                  {fmt(summary.paidAmountCents)}
                </span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>Остаток</span>
                <span className={styles.fieldValue}>
                  {fmt(summary.balanceCents)}
                </span>
              </div>
            </div>
            {summary.overpaymentCents > 0 ? (
              <p className={styles.overpayment}>
                Переплата: {fmt(summary.overpaymentCents)}
              </p>
            ) : null}
            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModal({ type: "changeAmount" })}
              >
                Изменить сумму
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setModalDate(
                    profile.contractDate
                      ? formatDateKeyRu(profile.contractDate)
                      : "",
                  );
                  setModal({ type: "changeDate" });
                }}
              >
                Изменить дату
              </Button>
            </div>
          </>
        ) : (
          <div className={styles.createForm}>
            <label className={styles.field}>
              <span>Сумма договора (€)</span>
              <input
                className={styles.input}
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                disabled={submitting}
                placeholder="например 3800"
              />
            </label>
            <label className={styles.field}>
              <span>Дата договора</span>
              <input
                className={styles.input}
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                placeholder="ДД.ММ.ГГГГ"
                inputMode="numeric"
                autoComplete="off"
                disabled={submitting}
              />
            </label>
            <p className={styles.hint}>Направление: {directionLabel}</p>
            <Button
              type="button"
              onClick={() => void handleCreateContract()}
              disabled={submitting || !newAmount.trim() || !newDate.trim()}
            >
              {submitting ? "Сохранение…" : "Создать договор"}
            </Button>
          </div>
        )}
      </Card>

      <Card className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle} style={{ margin: 0 }}>
            Платежи
          </h2>
          {hasContract ? (
            <Button
              type="button"
              onClick={() => {
                setModalDate("");
                setModal({ type: "addPayment" });
              }}
              disabled={submitting}
            >
              Добавить платёж
            </Button>
          ) : null}
        </div>

        {activePayments.length === 0 ? (
          <p className={styles.emptyPayments}>Платежей пока нет.</p>
        ) : (
          <ul className={styles.paymentList}>
            {activePayments.map((p) => (
              <li key={p.id} className={styles.paymentItem}>
                <div>
                  <strong>{fmt(p.amountCents)}</strong>
                  <span className={styles.paymentMeta}>
                    {" · "}
                    {formatDateKeyRu(p.paymentDate)}
                    {p.comment ? ` · ${p.comment}` : ""}
                    {" · "}
                    {p.createdByName}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setModal({ type: "void", paymentId: p.id })}
                >
                  Аннулировать
                </Button>
              </li>
            ))}
          </ul>
        )}

        {voidedPayments.length > 0 ? (
          <>
            <h3 className={styles.subTitle}>Аннулированные платежи</h3>
            <ul className={styles.paymentList}>
              {voidedPayments.map((p) => (
                <li key={p.id} className={styles.paymentItemVoided}>
                  <span>
                    {fmt(p.amountCents)} · {formatDateKeyRu(p.paymentDate)}
                    {p.voidReason ? ` · Причина: ${p.voidReason}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Card>

      {modal ? (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div
            className={styles.backdrop}
            onClick={() => !submitting && resetModal()}
          />
          <Card className={styles.modal}>
            <h2 className={styles.modalTitle}>
              {modal.type === "changeAmount" && "Изменить сумму договора"}
              {modal.type === "changeDate" && "Изменить дату договора"}
              {modal.type === "addPayment" && "Добавить платёж"}
              {modal.type === "void" && "Аннулировать платёж"}
            </h2>

            {modal.type === "changeAmount" ? (
              <label className={styles.field}>
                <span>Новая сумма (€)</span>
                <input
                  className={styles.input}
                  value={modalAmount}
                  onChange={(e) => setModalAmount(e.target.value)}
                  disabled={submitting}
                />
              </label>
            ) : null}

            {modal.type === "changeDate" ? (
              <label className={styles.field}>
                <span>Новая дата</span>
                <input
                  className={styles.input}
                  value={modalDate}
                  onChange={(e) => setModalDate(e.target.value)}
                  placeholder="ДД.ММ.ГГГГ"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={submitting}
                />
              </label>
            ) : null}

            {modal.type === "addPayment" ? (
              <>
                <label className={styles.field}>
                  <span>Сумма (€)</span>
                  <input
                    className={styles.input}
                    value={modalAmount}
                    onChange={(e) => setModalAmount(e.target.value)}
                    disabled={submitting}
                  />
                </label>
                <label className={styles.field}>
                  <span>Дата платежа</span>
                  <input
                    className={styles.input}
                    value={modalDate}
                    onChange={(e) => setModalDate(e.target.value)}
                    placeholder="ДД.ММ.ГГГГ"
                    inputMode="numeric"
                    autoComplete="off"
                    disabled={submitting}
                  />
                </label>
                <label className={styles.field}>
                  <span>Комментарий</span>
                  <input
                    className={styles.input}
                    value={modalComment}
                    onChange={(e) => setModalComment(e.target.value)}
                    disabled={submitting}
                  />
                </label>
              </>
            ) : null}

            {modal.type === "changeAmount" ||
            modal.type === "changeDate" ||
            modal.type === "void" ? (
              <label className={styles.field}>
                <span>Причина</span>
                <textarea
                  className={styles.textarea}
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  disabled={submitting}
                  rows={3}
                />
              </label>
            ) : null}

            <div className={styles.modalActions}>
              <Button
                type="button"
                variant="secondary"
                onClick={resetModal}
                disabled={submitting}
              >
                Отмена
              </Button>
              <Button
                type="button"
                variant={modal.type === "void" ? "danger" : "primary"}
                disabled={submitting}
                onClick={() => {
                  if (modal.type === "addPayment") void handleAddPayment();
                  else if (modal.type === "void") void handleVoid();
                  else void handleContractChange();
                }}
              >
                {submitting ? "Сохранение…" : "Подтвердить"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
