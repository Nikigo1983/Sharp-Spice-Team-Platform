import "server-only";

import { randomUUID } from "node:crypto";
import type { SessionUser } from "@/lib/auth/types";
import { FinanceError } from "./errors";
import { canManageFinance, canViewFinance } from "./permissions";
import { getFinanceStore } from "./store-selection";
import type {
  FinanceAnalyticsQuery,
  FinanceClientsQuery,
} from "./store";
import type {
  FinanceAnalyticsResult,
  FinanceClientDetail,
  FinanceClientListItem,
} from "./types";
import {
  parseAmountInput,
  validateContractDate,
  validatePaymentDate,
} from "./validation";

function assertView(actor: SessionUser) {
  if (!canViewFinance(actor)) {
    throw new FinanceError("FINANCE_ACCESS_DENIED", "Finance access denied", 403);
  }
}

function assertManage(actor: SessionUser) {
  if (!canManageFinance(actor)) {
    throw new FinanceError("FINANCE_ACCESS_DENIED", "Finance access denied", 403);
  }
}

export type { FinanceClientsQuery };

export async function getFinanceSummary(actor: SessionUser) {
  assertView(actor);
  const store = await getFinanceStore();
  return store.getSummary(actor);
}

export async function listFinanceClients(
  actor: SessionUser,
  query: FinanceClientsQuery = {},
): Promise<{
  items: FinanceClientListItem[];
  total: number;
  page: number;
  limit: number;
}> {
  assertView(actor);
  const store = await getFinanceStore();
  return store.listClients(actor, query);
}

export async function getClientFinance(
  actor: SessionUser,
  clientExternalId: string,
): Promise<FinanceClientDetail> {
  assertView(actor);
  const store = await getFinanceStore();
  return store.getClientFinance(actor, clientExternalId);
}

export async function createOrSetContract(
  actor: SessionUser,
  clientExternalId: string,
  input: { amount: string | number; contractDate: string },
): Promise<FinanceClientDetail> {
  assertManage(actor);
  const amountCents = parseAmountInput(input.amount);
  const contractDate = validateContractDate(input.contractDate);
  const store = await getFinanceStore();
  return store.createContract(actor, clientExternalId, {
    amountCents,
    contractDate,
  });
}

export async function changeContract(
  actor: SessionUser,
  clientExternalId: string,
  input: {
    amount?: string | number;
    contractDate?: string;
    reason: string;
    expectedVersion?: number;
  },
): Promise<FinanceClientDetail> {
  assertManage(actor);
  const store = await getFinanceStore();
  return store.changeContract(actor, clientExternalId, {
    amountCents:
      input.amount != null ? parseAmountInput(input.amount) : undefined,
    contractDate:
      input.contractDate != null
        ? validateContractDate(input.contractDate)
        : undefined,
    reason: input.reason,
    expectedVersion: input.expectedVersion,
  });
}

export async function addPayment(
  actor: SessionUser,
  clientExternalId: string,
  input: {
    amount: string | number;
    paymentDate: string;
    comment?: string;
    idempotencyKey?: string;
  },
): Promise<FinanceClientDetail> {
  assertManage(actor);
  const amountCents = parseAmountInput(input.amount);
  const paymentDate = validatePaymentDate(input.paymentDate);
  const idempotencyKey = input.idempotencyKey?.trim() || randomUUID();
  const store = await getFinanceStore();
  return store.createPayment(actor, clientExternalId, {
    amountCents,
    paymentDate,
    comment: input.comment,
    idempotencyKey,
  });
}

export async function voidPayment(
  actor: SessionUser,
  clientExternalId: string,
  paymentId: string,
  reason: string,
): Promise<FinanceClientDetail> {
  assertManage(actor);
  const store = await getFinanceStore();
  return store.voidPayment(actor, clientExternalId, { paymentId, reason });
}

export async function getFinanceAnalytics(
  actor: SessionUser,
  query: FinanceAnalyticsQuery = {},
): Promise<FinanceAnalyticsResult> {
  assertView(actor);
  const store = await getFinanceStore();
  return store.getAnalytics(actor, query);
}
