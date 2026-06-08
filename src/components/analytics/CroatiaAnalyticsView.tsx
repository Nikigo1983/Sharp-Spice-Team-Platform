"use client";

import { formatDays } from "@/lib/analytics/dates";
import type { CroatiaAnalytics } from "@/lib/analytics/types";
import { AnalyticsBlock } from "./AnalyticsBlock";
import { AnalyticsTable } from "./AnalyticsTable";
import { KpiGrid } from "./KpiGrid";
import { SimpleBarChart } from "./SimpleBarChart";
import { SimpleLineChart } from "./SimpleLineChart";
import styles from "./CroatiaAnalyticsView.module.css";

type CroatiaAnalyticsViewProps = {
  data: CroatiaAnalytics;
};

function loadBadge(level: "low" | "medium" | "high") {
  if (level === "high") return "🔴 Высокая";
  if (level === "medium") return "🟡 Средняя";
  return "🟢 Низкая";
}

function trendIcon(trend: CroatiaAnalytics["processingTimes"]["trend"]) {
  if (trend === "accelerating") return "fa-arrow-trend-down";
  if (trend === "slowing") return "fa-arrow-trend-up";
  if (trend === "stable") return "fa-minus";
  return "fa-circle-question";
}

export function CroatiaAnalyticsView({ data }: CroatiaAnalyticsViewProps) {
  const barPoints = data.monthlyTrend.map((m) => ({
    label: m.label,
    values: { submitted: m.submitted, approved: m.approved },
  }));

  return (
    <div className={styles.page}>
      <AnalyticsBlock
        title="Общая статистика"
        subtitle="Заявки и одобрения ВНЖ за выбранный период"
      >
        <KpiGrid
          items={[
            {
              label: "Подано заявок",
              value: String(data.overview.submitted),
              icon: "fa-solid fa-file-import",
            },
            {
              label: "Одобрено ВНЖ",
              value: String(data.overview.approved),
              icon: "fa-solid fa-passport",
            },
            {
              label: "Активных дел",
              value: String(data.overview.activeCases),
              icon: "fa-solid fa-briefcase",
            },
            {
              label: "Средний срок",
              value: formatDays(data.overview.avgProcessingDays),
              icon: "fa-solid fa-clock",
            },
            {
              label: "Самое быстрое",
              value: formatDays(data.overview.fastestDays),
              icon: "fa-solid fa-bolt",
            },
            {
              label: "Самое долгое",
              value: formatDays(data.overview.slowestDays),
              icon: "fa-solid fa-hourglass-end",
            },
          ]}
          columns={3}
        />
        <SimpleBarChart
          points={barPoints}
          series={[
            {
              key: "submitted",
              label: "Подано по месяцам",
              color: "rgba(145, 13, 13, 0.85)",
            },
            {
              key: "approved",
              label: "Одобрено по месяцам",
              color: "rgba(74, 222, 128, 0.85)",
            },
          ]}
        />
      </AnalyticsBlock>

      <AnalyticsBlock
        title="Сроки рассмотрения MUP"
        subtitle="Средние сроки и динамика по месяцам"
      >
        <KpiGrid
          items={[
            {
              label: "Средний срок",
              value: formatDays(data.processingTimes.avgProcessingDays),
            },
            {
              label: "За 30 дней",
              value: formatDays(data.processingTimes.avgLast30Days),
            },
            {
              label: "За 90 дней",
              value: formatDays(data.processingTimes.avgLast90Days),
            },
            {
              label: "Тренд",
              value: data.processingTimes.trendLabel,
              icon: `fa-solid ${trendIcon(data.processingTimes.trend)}`,
            },
          ]}
          columns={4}
        />
        <SimpleLineChart points={data.processingTimes.monthlyAvg} />
      </AnalyticsBlock>

      <AnalyticsBlock
        title="Аналитика по инспекторам MUP"
        subtitle="Референт из таблицы клиентов используется как инспектор"
      >
        <AnalyticsTable
          rows={data.inspectors}
          getRowKey={(r) => r.inspector}
          columns={[
            { key: "inspector", header: "Инспектор", render: (r) => r.inspector },
            {
              key: "active",
              header: "Активных дел",
              align: "right",
              render: (r) => r.activeCases,
            },
            {
              key: "completed",
              header: "Завершено",
              align: "right",
              render: (r) => r.completedCases,
            },
            {
              key: "avg",
              header: "Средний срок",
              align: "right",
              render: (r) => formatDays(r.avgProcessingDays),
            },
            {
              key: "fast",
              header: "Быстрее всего",
              align: "right",
              render: (r) => formatDays(r.fastestDays),
            },
            {
              key: "slow",
              header: "Дольше всего",
              align: "right",
              render: (r) => formatDays(r.slowestDays),
            },
          ]}
        />
      </AnalyticsBlock>

      <AnalyticsBlock
        title="Прогноз по активным делам"
        subtitle="Прогноз даты решения на основе среднего срока инспектора"
      >
        <AnalyticsTable
          rows={data.forecasts}
          getRowKey={(r) => r.clientId}
          emptyText="Нет активных дел"
          columns={[
            { key: "name", header: "Клиент", render: (r) => r.clientName },
            { key: "inspector", header: "Инспектор", render: (r) => r.inspector },
            {
              key: "days",
              header: "Дней в работе",
              align: "right",
              render: (r) => r.daysInWork,
            },
            {
              key: "avg",
              header: "Средний срок инспектора",
              align: "right",
              render: (r) => formatDays(r.inspectorAvgDays),
            },
            {
              key: "predicted",
              header: "Прогноз решения",
              render: (r) => r.predictedDecisionAt ?? "—",
            },
          ]}
        />
      </AnalyticsBlock>

      <AnalyticsBlock
        title="Визы D"
        subtitle="Статистика по консульствам (доп. источник данных)"
      >
        <KpiGrid
          items={[
            { label: "Подано", value: String(data.visaD.overview.submitted) },
            { label: "Выдано виз", value: String(data.visaD.overview.issued) },
            { label: "Отказано", value: String(data.visaD.overview.rejected) },
            {
              label: "% одобрения",
              value: `${data.visaD.overview.approvalRate}%`,
            },
            {
              label: "% отказов",
              value: `${data.visaD.overview.rejectionRate}%`,
            },
            {
              label: "Средний срок",
              value: formatDays(data.visaD.overview.avgProcessingDays),
            },
          ]}
          columns={3}
        />
        <AnalyticsTable
          rows={data.visaD.consulates}
          getRowKey={(r) => r.consulate}
          columns={[
            { key: "c", header: "Консульство", render: (r) => r.consulate },
            { key: "s", header: "Подано", align: "right", render: (r) => r.submitted },
            { key: "a", header: "Одобрено", align: "right", render: (r) => r.approved },
            { key: "r", header: "Отказано", align: "right", render: (r) => r.rejected },
            {
              key: "rate",
              header: "% одобрения",
              align: "right",
              render: (r) => `${r.approvalRate}%`,
            },
            {
              key: "avg",
              header: "Средний срок",
              align: "right",
              render: (r) => formatDays(r.avgProcessingDays),
            },
          ]}
        />
      </AnalyticsBlock>

      <AnalyticsBlock title="Адреса" subtitle="Нагрузка по адресам букинга">
        <AnalyticsTable
          rows={data.addresses}
          getRowKey={(r) => r.address}
          emptyText="Нет адресов в данных клиентов"
          columns={[
            { key: "addr", header: "Адрес", render: (r) => r.address },
            {
              key: "active",
              header: "Активных клиентов",
              align: "right",
              render: (r) => r.activeClients,
            },
            {
              key: "total",
              header: "Всего клиентов",
              align: "right",
              render: (r) => r.totalClients,
            },
            {
              key: "approved",
              header: "Одобрено",
              align: "right",
              render: (r) => r.approvedCount,
            },
            {
              key: "load",
              header: "Нагрузка",
              render: (r) => loadBadge(r.loadLevel),
            },
          ]}
        />
      </AnalyticsBlock>

      <AnalyticsBlock title="Нагрузка на адреса">
        <KpiGrid
          items={[
            {
              label: "Уникальных адресов",
              value: String(data.addressLoad.uniqueAddresses),
            },
            {
              label: "Адресов > 5 клиентов",
              value: String(data.addressLoad.overFiveClients),
            },
            {
              label: "Адресов > 10 клиентов",
              value: String(data.addressLoad.overTenClients),
            },
          ]}
          columns={3}
        />
        <p className={styles.loadHint}>
          Индикация: 🟢 до 4 активных · 🟡 5–9 · 🔴 10 и более
        </p>
      </AnalyticsBlock>
    </div>
  );
}
