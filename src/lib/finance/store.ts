/**
 * Finance persistence port. Sharp & Spice uses portal questionnaires + JSON/app_state.
 */
import type { SessionUser } from "@/lib/auth/types";
import type { FinancePaymentStatus } from "./calculations";
import type {
  FinanceAnalyticsResult,
  FinanceClientDetail,
  FinanceClientListItem,
} from "./types";
import type { FinanceDashboardKpis as KpiType } from "./calculations";

export type FinanceClientsQuery = {
  search?: string;
  direction?: string;
  paymentStatus?: FinancePaymentStatus | "all";
  page?: number;
  limit?: number;
  sort?: "name" | "balance" | "contractDate" | "lastPayment";
};

export type FinanceAnalyticsQuery = {
  periodType?: "month" | "year";
  year?: number;
  month?: number;
  direction?: string;
};

export type CreateContractInput = {
  amountCents: number;
  contractDate: string;
};

export type ChangeContractInput = {
  amountCents?: number;
  contractDate?: string;
  reason: string;
  expectedVersion?: number;
};

export type CreatePaymentInput = {
  amountCents: number;
  paymentDate: string;
  comment?: string | null;
  idempotencyKey: string;
};

export type VoidPaymentInput = {
  paymentId: string;
  reason: string;
};

export type FinanceStore = {
  getSummary(actor: SessionUser): Promise<KpiType>;
  listClients(
    actor: SessionUser,
    query: FinanceClientsQuery,
  ): Promise<{
    items: FinanceClientListItem[];
    total: number;
    page: number;
    limit: number;
  }>;
  getClientFinance(
    actor: SessionUser,
    clientExternalId: string,
  ): Promise<FinanceClientDetail>;
  createContract(
    actor: SessionUser,
    clientExternalId: string,
    input: CreateContractInput,
  ): Promise<FinanceClientDetail>;
  changeContract(
    actor: SessionUser,
    clientExternalId: string,
    input: ChangeContractInput,
  ): Promise<FinanceClientDetail>;
  createPayment(
    actor: SessionUser,
    clientExternalId: string,
    input: CreatePaymentInput,
  ): Promise<FinanceClientDetail>;
  voidPayment(
    actor: SessionUser,
    clientExternalId: string,
    input: VoidPaymentInput,
  ): Promise<FinanceClientDetail>;
  getAnalytics(
    actor: SessionUser,
    query: FinanceAnalyticsQuery,
  ): Promise<FinanceAnalyticsResult>;
};

export type { FinanceDashboardKpis } from "./calculations";
