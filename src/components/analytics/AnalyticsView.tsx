"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { exportCroatiaExcel, exportCroatiaPdf } from "@/lib/analytics/export";
import { resolvePeriodRange, type PeriodPreset } from "@/lib/analytics/period";
import type { AnalyticsSection, CroatiaAnalytics } from "@/lib/analytics/types";
import { AnalyticsBlock } from "./AnalyticsBlock";
import { CroatiaAnalyticsView } from "./CroatiaAnalyticsView";
import { PeriodFilter } from "./PeriodFilter";
import styles from "./AnalyticsView.module.css";

const SECTIONS: Array<{ id: AnalyticsSection; label: string; icon: string }> = [
  { id: "croatia", label: "Хорватия", icon: "fa-flag" },
  { id: "spain", label: "Испания", icon: "fa-flag" },
  { id: "checkups", label: "Мед. чекапы", icon: "fa-heart-pulse" },
];

const PLACEHOLDER_BLOCKS: Record<"spain" | "checkups", string[]> = {
  spain: [
    "Общая статистика",
    "Статистика по типу заявителя",
    "Динамика по месяцам и кварталам",
    "Сроки рассмотрения",
    "Семейные заявки",
  ],
  checkups: [
    "Общая статистика",
    "Демография и возрастные группы",
    "Популярность программ",
    "Медицинская статистика",
    "ТОП выявляемых проблем",
    "Аналитика по полу",
    "Индекс здоровья",
    "Рекомендации после чекапа",
    "Повторные обращения",
  ],
};

function defaultCustomRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function AnalyticsView() {
  const [section, setSection] = useState<AnalyticsSection>("croatia");
  const [preset, setPreset] = useState<PeriodPreset>("current_month");
  const [customFrom, setCustomFrom] = useState(defaultCustomRange().from);
  const [customTo, setCustomTo] = useState(defaultCustomRange().to);
  const [data, setData] = useState<CroatiaAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const periodLabel = resolvePeriodRange(
    preset,
    customFrom,
    customTo,
  ).label;

  const loadCroatia = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ preset });
      if (preset === "custom") {
        params.set("from", customFrom);
        params.set("to", customTo);
      }
      const res = await fetch(`/api/analytics/croatia?${params.toString()}`);
      if (!res.ok) throw new Error("Не удалось загрузить аналитику");
      const json = (await res.json()) as CroatiaAnalytics;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    if (section === "croatia") {
      void loadCroatia();
    }
  }, [section, loadCroatia]);

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          {SECTIONS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={
                section === tab.id ? styles.tabActive : styles.tab
              }
              onClick={() => setSection(tab.id)}
            >
              <i className={`fa-solid ${tab.icon}`} aria-hidden />
              {tab.label}
            </button>
          ))}
        </div>
        <div className={styles.exportRow}>
          <Button
            type="button"
            className={styles.exportBtn}
            disabled={!data || section !== "croatia"}
            onClick={() => data && exportCroatiaExcel(data)}
          >
            <i className="fa-solid fa-file-excel" aria-hidden />
            Excel
          </Button>
          <Button
            type="button"
            className={styles.exportBtn}
            disabled={section !== "croatia" || !data}
            onClick={exportCroatiaPdf}
          >
            <i className="fa-solid fa-file-pdf" aria-hidden />
            PDF
          </Button>
        </div>
      </div>

      <PeriodFilter
        preset={preset}
        customFrom={customFrom}
        customTo={customTo}
        periodLabel={periodLabel}
        onPresetChange={setPreset}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      {section === "croatia" ? (
        <>
          {loading ? (
            <Card className={styles.stateCard}>Загрузка аналитики…</Card>
          ) : error ? (
            <Card className={styles.stateCard}>{error}</Card>
          ) : data ? (
            <>
              <p className={styles.meta}>
                Источник:{" "}
                {data.source === "google_sheets"
                  ? "Google Sheets · Клиенты Хорватия"
                  : "Демо-данные"}
                {" · "}
                Обновлено:{" "}
                {new Date(data.generatedAt).toLocaleString("ru-RU")}
              </p>
              <div className={styles.printArea}>
                <CroatiaAnalyticsView data={data} />
              </div>
            </>
          ) : null}
        </>
      ) : (
        <AnalyticsBlock
          title={
            section === "spain"
              ? "Аналитика — Испания"
              : "Аналитика — Медицинские чекапы"
          }
          subtitle="Раздел будет подключён после загрузки данных"
        >
          <Card className={styles.placeholderCard}>
            <p className={styles.placeholderLead}>
              Данные по этому направлению появятся позже. Архитектура уже
              готова: фильтр периода, KPI, таблицы и графики будут работать
              так же, как для Хорватии.
            </p>
            <p className={styles.placeholderFuture}>
              Также запланированы: финансовый дашборд, B2B, AI и маркетинг.
            </p>
            <ul className={styles.placeholderList}>
              {PLACEHOLDER_BLOCKS[section].map((block) => (
                <li key={block}>{block}</li>
              ))}
            </ul>
          </Card>
        </AnalyticsBlock>
      )}
    </div>
  );
}
