import type { DateRange, PeriodPreset } from "./period";

export type AnalyticsSection = "croatia" | "spain" | "checkups";

export type MonthlyPoint = {
  key: string;
  label: string;
  submitted: number;
  approved: number;
  avgProcessingDays: number | null;
};

export type InspectorRow = {
  inspector: string;
  activeCases: number;
  completedCases: number;
  avgProcessingDays: number | null;
  fastestDays: number | null;
  slowestDays: number | null;
};

export type ActiveCaseForecast = {
  clientId: string;
  clientName: string;
  inspector: string;
  daysInWork: number;
  inspectorAvgDays: number | null;
  predictedDecisionAt: string | null;
};

export type ConsulateVisaRow = {
  consulate: string;
  submitted: number;
  approved: number;
  rejected: number;
  approvalRate: number;
  rejectionRate: number;
  avgProcessingDays: number | null;
};

export type AddressRow = {
  address: string;
  activeClients: number;
  totalClients: number;
  approvedCount: number;
  loadLevel: "low" | "medium" | "high";
};

export type AddressLoadSummary = {
  uniqueAddresses: number;
  overFiveClients: number;
  overTenClients: number;
};

export type CroatiaAnalytics = {
  range: DateRange;
  source: "google_sheets" | "demo";
  generatedAt: string;
  overview: {
    submitted: number;
    approved: number;
    activeCases: number;
    avgProcessingDays: number | null;
    fastestDays: number | null;
    slowestDays: number | null;
  };
  monthlyTrend: MonthlyPoint[];
  processingTimes: {
    avgProcessingDays: number | null;
    avgLast30Days: number | null;
    avgLast90Days: number | null;
    trend: "accelerating" | "slowing" | "stable" | "unknown";
    trendLabel: string;
    monthlyAvg: Array<{ key: string; label: string; value: number | null }>;
  };
  inspectors: InspectorRow[];
  forecasts: ActiveCaseForecast[];
  visaD: {
    hasData: boolean;
    overview: {
      submitted: number;
      issued: number;
      rejected: number;
      approvalRate: number;
      rejectionRate: number;
      avgProcessingDays: number | null;
    };
    consulates: ConsulateVisaRow[];
  };
  addresses: AddressRow[];
  addressLoad: AddressLoadSummary;
};

export type AnalyticsQuery = {
  section: AnalyticsSection;
  preset: PeriodPreset;
  from?: string;
  to?: string;
};

export type PlaceholderSection = {
  section: "spain" | "checkups";
  title: string;
  message: string;
  plannedBlocks: string[];
};
