"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { SpioraAnswerDisplay } from "@/lib/spiora-survey/format";
import type { SpioraSurveyListItem } from "@/lib/spiora-survey/types";
import styles from "./SpioraSurveyResponsesPanel.module.css";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function SpioraSurveyResponsesPanel() {
  const [items, setItems] = useState<SpioraSurveyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [display, setDisplay] = useState<SpioraAnswerDisplay[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/spiora-survey");
      if (!res.ok) {
        setError("Не удалось загрузить ответы.");
        return;
      }
      const data = (await res.json()) as { items: SpioraSurveyListItem[] };
      setItems(data.items ?? []);
    } catch {
      setError("Сеть недоступна.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function openDetail(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    setDisplay(null);
    try {
      const res = await fetch(`/api/spiora-survey?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        setError("Не удалось открыть ответ.");
        return;
      }
      const data = (await res.json()) as { display: SpioraAnswerDisplay[] };
      setDisplay(data.display ?? []);
    } catch {
      setError("Сеть недоступна.");
    } finally {
      setDetailLoading(false);
    }
  }

  if (selectedId) {
    const meta = items.find((i) => i.id === selectedId);
    return (
      <div className={styles.wrap}>
        <SectionHeader
          title={meta?.companyName || (meta?.anonymous ? "Анонимно" : "Ответ")}
          subtitle={meta ? formatDate(meta.createdAt) : undefined}
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSelectedId(null);
                setDisplay(null);
              }}
            >
              ← К списку
            </Button>
          }
        />

        {detailLoading ? <p className={styles.muted}>Загрузка…</p> : null}

        {display ? (
          <div className={styles.detailList}>
            {display.map((row) => (
              <Card key={row.questionId} className={styles.detailCard}>
                {row.section ? (
                  <p className={styles.detailSection}>{row.section}</p>
                ) : null}
                <h3 className={styles.detailTitle}>
                  {row.number ? `${row.number}. ` : null}
                  {row.title}
                </h3>
                <p className={styles.detailValue}>{row.value}</p>
              </Card>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <SectionHeader
        title="Ответы по анкете потенциальных клиентов"
        subtitle="Клиенты, которые заполнили исследование процессов."
        action={
          <Button type="button" variant="secondary" onClick={() => void loadList()}>
            Обновить
          </Button>
        }
      />

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Загрузка…</p> : null}

      {!loading && items.length === 0 ? (
        <Card className={styles.empty}>
          Пока нет ответов. Отправьте клиенту ссылку из раздела анкеты.
        </Card>
      ) : null}

      {items.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Компания</th>
                <th>Ниша</th>
                <th>Команда</th>
                <th>Острота</th>
                <th>Разговор</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={styles.row}
                  onClick={() => void openDetail(item.id)}
                >
                  <td>{formatDate(item.createdAt)}</td>
                  <td>
                    {item.anonymous
                      ? "Анонимно"
                      : item.companyName || "—"}
                    {item.contactName ? (
                      <span className={styles.sub}>{item.contactName}</span>
                    ) : null}
                  </td>
                  <td>{item.industryLabel || "—"}</td>
                  <td>{item.teamSizeLabel || "—"}</td>
                  <td>
                    {item.painScore != null ? `${item.painScore}/10` : "—"}
                  </td>
                  <td>{item.contactOkLabel || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
