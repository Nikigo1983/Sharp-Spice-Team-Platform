import type { FinancePaymentStatus } from "./calculations";
import type { FinanceCurrencyCode } from "./money";

export type FinanceContractChangeType =
  | "contract_created"
  | "amount_changed"
  | "date_changed"
  | "contract_archived";

export type FinanceProfileRecord = {
  id: string;
  clientExternalId: string;
  clientUuid: string | null;
  currencyCode: FinanceCurrencyCode;
  contractAmountCents: number | null;
  contractDate: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  archivedAt: string | null;
};

export type FinancePaymentRecord = {
  id: string;
  financeProfileId: string;
  clientExternalId: string;
  amountCents: number;
  currencyCode: FinanceCurrencyCode;
  paymentDate: string;
  comment: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidedByName: string | null;
  voidReason: string | null;
  idempotencyKey: string | null;
};

export type FinanceContractChangeRecord = {
  id: string;
  financeProfileId: string;
  clientExternalId: string;
  changeType: FinanceContractChangeType;
  oldContractAmountCents: number | null;
  newContractAmountCents: number | null;
  oldContractDate: string | null;
  newContractDate: string | null;
  reason: string;
  changedBy: string;
  changedByName: string;
  createdAt: string;
};

export type FinanceClientListItem = {
  clientExternalId: string;
  clientName: string;
  clientEmail: string;
  direction: string;
  directionNormalized: string | null;
  manager: string;
  contractDate: string | null;
  contractAmountCents: number | null;
  paidAmountCents: number;
  balanceCents: number | null;
  overpaymentCents: number;
  paymentStatus: FinancePaymentStatus;
  lastPaymentDate: string | null;
};

export type FinanceClientDetail = {
  clientExternalId: string;
  clientName: string;
  clientEmail: string;
  direction: string;
  directionNormalized: string | null;
  profile: FinanceProfileRecord | null;
  summary: {
    contractAmountCents: number | null;
    paidAmountCents: number;
    balanceCents: number | null;
    overpaymentCents: number;
    paymentStatus: FinancePaymentStatus;
  };
  payments: FinancePaymentRecord[];
  contractChanges: FinanceContractChangeRecord[];
};

export type FinanceAnalyticsResult = {
  periodType: "month" | "year";
  year: number;
  month: number | null;
  direction: string | null;
  contractsSignedCents: number;
  newClientsCount: number;
  receivedCents: number;
  paymentsCount: number;
  monthly: Array<{
    month: number;
    labelKey: string;
    receivedCents: number;
    contractsSignedCents: number;
  }>;
};
