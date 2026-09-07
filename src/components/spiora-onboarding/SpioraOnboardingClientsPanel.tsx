"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { OnboardingAnswerDisplay } from "@/lib/spiora-onboarding/format";
import type { SpioraOnboardingListItem } from "@/lib/spiora-onboarding/types";
import styles from "@/components/spiora-survey/SpioraSurveyResponsesPanel.module.css";

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

export function SpioraOnboardingClientsPanel() {
  const [items, setItems] = useState<SpioraOnboardingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [display, setDisplay] = useState<OnboardingAnswerDisplay[] | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/spiora-onboarding");
      if (!res.ok) {
        setError("Не удалось загрузить клиентов.");
        return;
      }
      const data = (await res.json()) as { items: SpioraOnboardingListItem[] };
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
      const res = await fetch(
        `/api/spiora-onboarding?id=${encodeURIComponent(id)}`,
      );
      if (!res.ok) {
        setError("Не удалось открыть анкету.");
        return;
      }
      const data = (await res.json()) as { display: OnboardingAnswerDisplay[] };
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
          title={meta?.companyName || "Клиент SPIORA"}
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
            {display.map((row, index) => {
              const prev = index > 0 ? display[index - 1] : null;
              const showSection = !prev || prev.section !== row.section;
              return (
                <Card key={row.fieldId} className={styles.detailCard}>
                  {showSection ? (
                    <p className={styles.detailSection}>{row.section}</p>
                  ) : null}
                  <h3 className={styles.detailTitle}>{row.label}</h3>
                  <p className={styles.detailValue}>{row.value}</p>
                </Card>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <SectionHeader
        title="Клиенты SPIORA"
        subtitle="Компании, которые заполнили анкету внедрения платформы."
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
          Пока нет ответов. Отправьте клиенту ссылку из раздела анкеты внедрения.
        </Card>
      ) : null}

      {items.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Компания</th>
                <th>Контакт</th>
                <th>Готовность</th>
                <th>Go-live</th>
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
                  <td>{item.companyName}</td>
                  <td>
                    {item.contactName || "—"}
                    {item.contactEmail ? (
                      <span className={styles.sub}>{item.contactEmail}</span>
                    ) : null}
                  </td>
                  <td>{item.readinessLabel || "—"}</td>
                  <td>{item.goLiveLabel || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
