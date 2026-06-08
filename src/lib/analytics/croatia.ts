import type { Client } from "@/lib/google-sheets/types";
import { listAllClients } from "@/lib/google-sheets/service";
import {
  addDays,
  daysBetween,
  pickApprovalDate,
  pickSubmissionDate,
} from "./dates";
import { getCroatiaSupplement } from "./croatia-supplement";
import {
  formatMonthKey,
  formatRuDate,
  isInRange,
  chartMonthKeys,
  type DateRange,
} from "./period";
import type {
  ActiveCaseForecast,
  AddressLoadSummary,
  AddressRow,
  ConsulateVisaRow,
  CroatiaAnalytics,
  InspectorRow,
  MonthlyPoint,
} from "./types";

function isCroatiaClient(client: Client): boolean {
  return (
    client.direction === "Хорватия" ||
    client.country === "Хорватия" ||
    Boolean(client.submittedAt && client.submittedAt !== "—")
  );
}

function isApproved(client: Client): boolean {
  if (client.status === "Завершён") return true;
  const approval = pickApprovalDate(client);
  return Boolean(approval);
}

function isActive(client: Client): boolean {
  return !isApproved(client);
}

function getInspector(client: Client): string {
  const name =
    (client.referentName && client.referentName !== "—"
      ? client.referentName
      : "") ||
    (client.manager && client.manager !== "—" ? client.manager : "");
  return name || "Не указан";
}

function getAddress(client: Client): string | null {
  const addr = (client.bookingAddress ?? "").trim();
  if (!addr || addr === "—") return null;
  return addr;
}

function processingDays(client: Client): number | null {
  const start = pickSubmissionDate(client);
  const end = pickApprovalDate(client);
  if (!start || !end) return null;
  return daysBetween(start, end);
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function addressLoadLevel(activeClients: number): AddressRow["loadLevel"] {
  if (activeClients >= 10) return "high";
  if (activeClients >= 5) return "medium";
  return "low";
}

function computeTrend(
  monthly: Array<{ value: number | null }>,
): CroatiaAnalytics["processingTimes"]["trend"] {
  const values = monthly.map((m) => m.value).filter((v): v is number => v !== null);
  if (values.length < 2) return "unknown";
  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));
  const a = avg(firstHalf);
  const b = avg(secondHalf);
  if (a === null || b === null) return "unknown";
  const diff = b - a;
  if (Math.abs(diff) < 3) return "stable";
  return diff < 0 ? "accelerating" : "slowing";
}

function trendLabel(trend: CroatiaAnalytics["processingTimes"]["trend"]): string {
  switch (trend) {
    case "accelerating":
      return "Ускорение рассмотрения";
    case "slowing":
      return "Замедление рассмотрения";
    case "stable":
      return "Стабильные сроки";
    default:
      return "Недостаточно данных для тренда";
  }
}

function filterVisaByRange(
  supplement: Awaited<ReturnType<typeof getCroatiaSupplement>>,
  range: DateRange,
): Awaited<ReturnType<typeof getCroatiaSupplement>> {
  void range;
  return supplement;
}

export async function computeCroatiaAnalytics(
  range: DateRange,
): Promise<CroatiaAnalytics> {
  const { items: allClients, source } = await listAllClients();
  const clients = allClients.filter(isCroatiaClient);
  const now = new Date();

  const submittedInPeriod = clients.filter((c) => {
    const d = pickSubmissionDate(c);
    return isInRange(d, range);
  });

  const approvedInPeriod = clients.filter((c) => {
    const d = pickApprovalDate(c);
    return isInRange(d, range);
  });

  const activeCases = clients.filter(isActive);

  const completedWithDays = clients
    .map((c) => ({ client: c, days: processingDays(c) }))
    .filter((x) => x.days !== null) as Array<{ client: Client; days: number }>;

  const periodCompleted = completedWithDays.filter(({ client }) => {
    const approval = pickApprovalDate(client);
    return isInRange(approval, range);
  });

  const periodDays = periodCompleted.map((x) => x.days);
  const allDays = completedWithDays.map((x) => x.days);

  const monthKeys = chartMonthKeys(range);
  const monthlyTrend: MonthlyPoint[] = monthKeys.map((key) => {
    const [year, month] = key.split("-").map(Number);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const submitted = clients.filter((c) => {
      const d = pickSubmissionDate(c);
      return d && d >= monthStart && d <= monthEnd;
    }).length;

    const approved = clients.filter((c) => {
      const d = pickApprovalDate(c);
      return d && d >= monthStart && d <= monthEnd;
    }).length;

    const monthCompleted = completedWithDays.filter(({ client }) => {
      const d = pickApprovalDate(client);
      return d && d >= monthStart && d <= monthEnd;
    });

    return {
      key,
      label: formatMonthKey(key),
      submitted,
      approved,
      avgProcessingDays: avg(monthCompleted.map((x) => x.days)),
    };
  });

  const last30Start = addDays(now, -30);
  const last90Start = addDays(now, -90);

  const last30Days = completedWithDays
    .filter(({ client }) => {
      const d = pickApprovalDate(client);
      return d && d >= last30Start;
    })
    .map((x) => x.days);

  const last90Days = completedWithDays
    .filter(({ client }) => {
      const d = pickApprovalDate(client);
      return d && d >= last90Start;
    })
    .map((x) => x.days);

  const monthlyAvg = monthlyTrend.map((m) => ({
    key: m.key,
    label: m.label,
    value: m.avgProcessingDays,
  }));

  const trend = computeTrend(monthlyAvg);

  const inspectorMap = new Map<string, Client[]>();
  for (const client of clients) {
    const inspector = getInspector(client);
    const list = inspectorMap.get(inspector) ?? [];
    list.push(client);
    inspectorMap.set(inspector, list);
  }

  const inspectors: InspectorRow[] = [...inspectorMap.entries()]
    .map(([inspector, list]) => {
      const completed = list.filter(isApproved);
      const active = list.filter(isActive);
      const days = completed
        .map(processingDays)
        .filter((d): d is number => d !== null);

      return {
        inspector,
        activeCases: active.length,
        completedCases: completed.length,
        avgProcessingDays: avg(days),
        fastestDays: days.length ? Math.min(...days) : null,
        slowestDays: days.length ? Math.max(...days) : null,
      };
    })
    .sort((a, b) => {
      const avgA = a.avgProcessingDays ?? 9999;
      const avgB = b.avgProcessingDays ?? 9999;
      if (avgA !== avgB) return avgA - avgB;
      return b.completedCases - a.completedCases;
    });

  const inspectorAvgMap = new Map(
    inspectors.map((i) => [i.inspector, i.avgProcessingDays]),
  );

  const forecasts: ActiveCaseForecast[] = activeCases.map((client) => {
    const inspector = getInspector(client);
    const start = pickSubmissionDate(client) ?? now;
    const daysInWork = daysBetween(start, now);
    const inspectorAvgDays = inspectorAvgMap.get(inspector) ?? null;
    const predicted =
      inspectorAvgDays !== null ? addDays(start, Math.round(inspectorAvgDays)) : null;

    return {
      clientId: client.id,
      clientName: client.name,
      inspector,
      daysInWork,
      inspectorAvgDays,
      predictedDecisionAt: predicted ? formatRuDate(predicted) : null,
    };
  });

  const supplement = filterVisaByRange(await getCroatiaSupplement(), range);
  const visaRows = supplement.visaD;

  const visaSubmitted = visaRows.reduce((s, r) => s + r.submitted, 0);
  const visaApproved = visaRows.reduce((s, r) => s + r.approved, 0);
  const visaRejected = visaRows.reduce((s, r) => s + r.rejected, 0);
  const visaTotal = visaApproved + visaRejected;

  const consulates: ConsulateVisaRow[] = visaRows.map((row) => {
    const decided = row.approved + row.rejected;
    return {
      consulate: row.consulate,
      submitted: row.submitted,
      approved: row.approved,
      rejected: row.rejected,
      approvalRate: decided ? Math.round((row.approved / decided) * 100) : 0,
      rejectionRate: decided ? Math.round((row.rejected / decided) * 100) : 0,
      avgProcessingDays: row.avgProcessingDays,
    };
  });

  const addressMap = new Map<string, Client[]>();
  for (const client of clients) {
    const addr = getAddress(client);
    if (!addr) continue;
    const list = addressMap.get(addr) ?? [];
    list.push(client);
    addressMap.set(addr, list);
  }

  const addresses: AddressRow[] = [...addressMap.entries()]
    .map(([address, list]) => {
      const activeClients = list.filter(isActive).length;
      const approvedCount = list.filter(isApproved).length;
      return {
        address,
        activeClients,
        totalClients: list.length,
        approvedCount,
        loadLevel: addressLoadLevel(activeClients),
      };
    })
    .sort((a, b) => b.activeClients - a.activeClients);

  const addressLoad: AddressLoadSummary = {
    uniqueAddresses: addresses.length,
    overFiveClients: addresses.filter((a) => a.totalClients > 5).length,
    overTenClients: addresses.filter((a) => a.totalClients > 10).length,
  };

  return {
    range,
    source,
    generatedAt: now.toISOString(),
    overview: {
      submitted: submittedInPeriod.length,
      approved: approvedInPeriod.length,
      activeCases: activeCases.length,
      avgProcessingDays: avg(periodDays.length ? periodDays : allDays),
      fastestDays: periodDays.length ? Math.min(...periodDays) : allDays.length ? Math.min(...allDays) : null,
      slowestDays: periodDays.length ? Math.max(...periodDays) : allDays.length ? Math.max(...allDays) : null,
    },
    monthlyTrend,
    processingTimes: {
      avgProcessingDays: avg(allDays),
      avgLast30Days: avg(last30Days),
      avgLast90Days: avg(last90Days),
      trend,
      trendLabel: trendLabel(trend),
      monthlyAvg,
    },
    inspectors,
    forecasts,
    visaD: {
      hasData: visaRows.length > 0,
      overview: {
        submitted: visaSubmitted,
        issued: visaApproved,
        rejected: visaRejected,
        approvalRate: visaTotal ? Math.round((visaApproved / visaTotal) * 100) : 0,
        rejectionRate: visaTotal ? Math.round((visaRejected / visaTotal) * 100) : 0,
        avgProcessingDays: avg(visaRows.map((r) => r.avgProcessingDays)),
      },
      consulates,
    },
    addresses,
    addressLoad,
  };
}
