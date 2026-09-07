import "server-only";

import type { SessionUser } from "@/lib/auth/types";
import {
  getSubmittedForStaff,
  listSubmittedForStaff,
} from "@/lib/client-portal/questionnaire-service";
import { readStaffFields } from "@/lib/client-portal/staff-fields";
import type { QuestionnaireRecord } from "@/lib/client-portal/questionnaire-types";
import {
  calculateClientFinance,
  calculateDashboardKpis,
} from "./calculations";
import { normalizeFinanceDirection, matchesDirectionFilter } from "./directions";
import { FinanceError } from "./errors";
import {
  newFinanceId,
  readFinanceStore,
  writeFinanceStore,
  type FinanceStoreData,
} from "./persistence";
import { FINANCE_CURRENCY_CODE } from "./money";
import type {
  FinanceAnalyticsResult,
  FinanceClientDetail,
  FinanceClientListItem,
  FinanceContractChangeRecord,
  FinancePaymentRecord,
  FinanceProfileRecord,
} from "./types";
import { validateContractDate, validatePaymentDate } from "./validation";
import type {
  ChangeContractInput,
  CreateContractInput,
  CreatePaymentInput,
  FinanceAnalyticsQuery,
  FinanceClientsQuery,
  FinanceStore,
  VoidPaymentInput,
} from "./store";

const DEFAULT_DIRECTION = "Croatia";

export function caseDisplayName(record: QuestionnaireRecord): string {
  const cyrillic = String(record.answers.full_name_cyrillic ?? "").trim();
  if (cyrillic) return cyrillic;
  const latin = String(record.answers.full_name_latin ?? "").trim();
  if (latin) return latin;
  const fromInvite = [record.firstName, record.email]
    .filter(Boolean)
    .join(" ")
    .trim();
  return fromInvite || record.email;
}

function caseManager(record: QuestionnaireRecord): string {
  return readStaffFields(record.answers).curator.trim() || "—";
}

function activePayments(
  store: FinanceStoreData,
  profileId: string,
): FinancePaymentRecord[] {
  return store.payments.filter(
    (p) => p.financeProfileId === profileId && !p.voidedAt,
  );
}

function paidTotal(store: FinanceStoreData, profileId: string): number {
  return activePayments(store, profileId).reduce(
    (sum, p) => sum + p.amountCents,
    0,
  );
}

function lastPaymentDate(
  store: FinanceStoreData,
  profileId: string,
): string | null {
  const dates = activePayments(store, profileId).map((p) => p.paymentDate);
  if (dates.length === 0) return null;
  return dates.sort().at(-1) ?? null;
}

function findActiveProfile(
  store: FinanceStoreData,
  clientExternalId: string,
): FinanceProfileRecord | undefined {
  return store.profiles.find(
    (p) => p.clientExternalId === clientExternalId && !p.archivedAt,
  );
}

function assertPositiveCents(amountCents: number): number {
  if (
    typeof amountCents !== "number" ||
    !Number.isInteger(amountCents) ||
    amountCents <= 0 ||
    !Number.isSafeInteger(amountCents)
  ) {
    throw new FinanceError(
      "FINANCE_PAYMENT_AMOUNT_INVALID",
      "Invalid amount",
    );
  }
  return amountCents;
}

export function createPortalFinanceStore(): FinanceStore {
  const storeApi: FinanceStore = {
    async getSummary(_actor) {
      const store = await readFinanceStore();
      const cases = await listSubmittedForStaff();
      const activeIds = new Set(cases.map((c) => c.id));

      const rows = store.profiles
        .filter((p) => !p.archivedAt && activeIds.has(p.clientExternalId))
        .map((p) => ({
          contractAmountCents: p.contractAmountCents,
          paidAmountCents: paidTotal(store, p.id),
        }));

      return calculateDashboardKpis(rows);
    },

    async listClients(_actor, query: FinanceClientsQuery) {
      const store = await readFinanceStore();
      const cases = await listSubmittedForStaff();
      const page = Math.max(1, query.page ?? 1);
      const limit = Math.min(100, Math.max(1, query.limit ?? 20));
      const search = query.search?.trim().toLowerCase() ?? "";
      const statusFilter = query.paymentStatus ?? "all";

      const items: FinanceClientListItem[] = [];

      for (const record of cases) {
        const profile = findActiveProfile(store, record.id);
        const paid = profile ? paidTotal(store, profile.id) : 0;
        const summary = calculateClientFinance(
          profile?.contractAmountCents ?? null,
          paid,
        );
        const name = caseDisplayName(record);
        const direction = DEFAULT_DIRECTION;

        if (search) {
          const hay =
            `${name} ${record.email} ${record.id}`.toLowerCase();
          if (!hay.includes(search)) continue;
        }

        if (!matchesDirectionFilter(direction, query.direction)) continue;

        if (statusFilter !== "all" && summary.paymentStatus !== statusFilter) {
          continue;
        }

        items.push({
          clientExternalId: record.id,
          clientName: name,
          clientEmail: record.email,
          direction,
          directionNormalized: normalizeFinanceDirection(direction),
          manager: caseManager(record),
          contractDate: profile?.contractDate ?? null,
          contractAmountCents: summary.contractAmountCents,
          paidAmountCents: summary.paidAmountCents,
          balanceCents: summary.balanceCents,
          overpaymentCents: summary.overpaymentCents,
          paymentStatus: summary.paymentStatus,
          lastPaymentDate: profile
            ? lastPaymentDate(store, profile.id)
            : null,
        });
      }

      const sort = query.sort ?? "name";
      items.sort((a, b) => {
        switch (sort) {
          case "balance":
            return (b.balanceCents ?? -1) - (a.balanceCents ?? -1);
          case "contractDate":
            return (b.contractDate ?? "").localeCompare(a.contractDate ?? "");
          case "lastPayment":
            return (b.lastPaymentDate ?? "").localeCompare(
              a.lastPaymentDate ?? "",
            );
          default:
            return a.clientName.localeCompare(b.clientName, "ru");
        }
      });

      const total = items.length;
      const start = (page - 1) * limit;
      return {
        items: items.slice(start, start + limit),
        total,
        page,
        limit,
      };
    },

    async getClientFinance(_actor, clientExternalId) {
      const record = await getSubmittedForStaff(clientExternalId);
      if (!record) {
        throw new FinanceError(
          "FINANCE_CLIENT_NOT_FOUND",
          "Client not found",
          404,
        );
      }
      const store = await readFinanceStore();
      const profile = findActiveProfile(store, clientExternalId) ?? null;
      const paid = profile ? paidTotal(store, profile.id) : 0;
      const summary = calculateClientFinance(
        profile?.contractAmountCents ?? null,
        paid,
      );
      const payments = profile
        ? store.payments
            .filter((p) => p.financeProfileId === profile.id)
            .sort(
              (a, b) =>
                b.paymentDate.localeCompare(a.paymentDate) ||
                b.createdAt.localeCompare(a.createdAt),
            )
        : [];
      const contractChanges = profile
        ? store.contractChanges
            .filter((c) => c.financeProfileId === profile.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [];

      const direction = DEFAULT_DIRECTION;
      return {
        clientExternalId: record.id,
        clientName: caseDisplayName(record),
        clientEmail: record.email,
        direction,
        directionNormalized: normalizeFinanceDirection(direction),
        profile,
        summary,
        payments,
        contractChanges,
      };
    },

    async createContract(actor, clientExternalId, input: CreateContractInput) {
      const record = await getSubmittedForStaff(clientExternalId);
      if (!record) {
        throw new FinanceError(
          "FINANCE_CLIENT_NOT_FOUND",
          "Client not found",
          404,
        );
      }

      const amountCents = assertPositiveCents(input.amountCents);
      const contractDate = validateContractDate(input.contractDate);
      const store = await readFinanceStore();
      const existing = findActiveProfile(store, clientExternalId);
      if (existing?.contractAmountCents != null) {
        throw new FinanceError(
          "FINANCE_CONTRACT_ALREADY_EXISTS",
          "Contract already set. Use change endpoint.",
          409,
        );
      }

      const now = new Date().toISOString();
      let profile = existing;
      if (!profile) {
        profile = {
          id: newFinanceId(),
          clientExternalId,
          clientUuid: null,
          currencyCode: FINANCE_CURRENCY_CODE,
          contractAmountCents: amountCents,
          contractDate,
          version: 1,
          createdAt: now,
          updatedAt: now,
          createdBy: actor.id,
          updatedBy: actor.id,
          archivedAt: null,
        };
        store.profiles.push(profile);
      } else {
        profile.contractAmountCents = amountCents;
        profile.contractDate = contractDate;
        profile.updatedAt = now;
        profile.updatedBy = actor.id;
        profile.version += 1;
      }

      const change: FinanceContractChangeRecord = {
        id: newFinanceId(),
        financeProfileId: profile.id,
        clientExternalId,
        changeType: "contract_created",
        oldContractAmountCents: null,
        newContractAmountCents: amountCents,
        oldContractDate: null,
        newContractDate: contractDate,
        reason: "Initial contract setup",
        changedBy: actor.id,
        changedByName: actor.name,
        createdAt: now,
      };
      store.contractChanges.push(change);
      await writeFinanceStore(store);
      return storeApi.getClientFinance(actor, clientExternalId);
    },

    async changeContract(
      actor,
      clientExternalId,
      input: ChangeContractInput,
    ) {
      const reason = input.reason.trim();
      if (!reason) {
        throw new FinanceError(
          "FINANCE_CHANGE_REASON_REQUIRED",
          "Change reason is required",
        );
      }

      const store = await readFinanceStore();
      const profile = findActiveProfile(store, clientExternalId);
      if (!profile || profile.contractAmountCents == null) {
        throw new FinanceError(
          "FINANCE_CONTRACT_NOT_SET",
          "Contract is not set yet",
        );
      }

      if (
        input.expectedVersion != null &&
        input.expectedVersion !== profile.version
      ) {
        throw new FinanceError(
          "FINANCE_CONCURRENT_MODIFICATION",
          "Finance data was changed by another employee. Refresh and try again.",
          409,
        );
      }

      const now = new Date().toISOString();
      let changed = false;

      if (input.amountCents != null) {
        const newAmount = assertPositiveCents(input.amountCents);
        if (newAmount === profile.contractAmountCents) {
          throw new FinanceError(
            "FINANCE_AMOUNT_UNCHANGED",
            "New amount equals current amount",
          );
        }
        const change: FinanceContractChangeRecord = {
          id: newFinanceId(),
          financeProfileId: profile.id,
          clientExternalId,
          changeType: "amount_changed",
          oldContractAmountCents: profile.contractAmountCents,
          newContractAmountCents: newAmount,
          oldContractDate: profile.contractDate,
          newContractDate: profile.contractDate,
          reason,
          changedBy: actor.id,
          changedByName: actor.name,
          createdAt: now,
        };
        store.contractChanges.push(change);
        profile.contractAmountCents = newAmount;
        changed = true;
      }

      if (input.contractDate != null) {
        const newDate = validateContractDate(input.contractDate);
        if (newDate === profile.contractDate) {
          if (!changed) {
            throw new FinanceError(
              "FINANCE_AMOUNT_UNCHANGED",
              "New date equals current date",
            );
          }
        } else {
          const change: FinanceContractChangeRecord = {
            id: newFinanceId(),
            financeProfileId: profile.id,
            clientExternalId,
            changeType: "date_changed",
            oldContractAmountCents: profile.contractAmountCents,
            newContractAmountCents: profile.contractAmountCents,
            oldContractDate: profile.contractDate,
            newContractDate: newDate,
            reason,
            changedBy: actor.id,
            changedByName: actor.name,
            createdAt: now,
          };
          store.contractChanges.push(change);
          profile.contractDate = newDate;
          changed = true;
        }
      }

      if (!changed) {
        throw new FinanceError(
          "FINANCE_AMOUNT_UNCHANGED",
          "No contract fields to change",
        );
      }

      profile.updatedAt = now;
      profile.updatedBy = actor.id;
      profile.version += 1;
      await writeFinanceStore(store);
      return storeApi.getClientFinance(actor, clientExternalId);
    },

    async createPayment(
      actor,
      clientExternalId,
      input: CreatePaymentInput,
    ) {
      const idempotencyKey = input.idempotencyKey?.trim();
      if (!idempotencyKey) {
        throw new FinanceError(
          "FINANCE_IDEMPOTENCY_REQUIRED",
          "Idempotency key is required",
        );
      }

      const store = await readFinanceStore();
      const profile = findActiveProfile(store, clientExternalId);
      if (!profile || profile.contractAmountCents == null) {
        throw new FinanceError(
          "FINANCE_CONTRACT_NOT_SET",
          "Contract amount is required before payments",
        );
      }

      const existing = store.payments.find(
        (p) =>
          p.financeProfileId === profile.id &&
          p.idempotencyKey === idempotencyKey,
      );
      if (existing) {
        return storeApi.getClientFinance(actor, clientExternalId);
      }

      const amountCents = assertPositiveCents(input.amountCents);
      const paymentDate = validatePaymentDate(input.paymentDate);
      const comment = input.comment?.trim() || null;
      if (comment && comment.length > 500) {
        throw new FinanceError(
          "FINANCE_COMMENT_TOO_LONG",
          "Comment is too long",
        );
      }

      const now = new Date().toISOString();
      const payment: FinancePaymentRecord = {
        id: newFinanceId(),
        financeProfileId: profile.id,
        clientExternalId,
        amountCents,
        currencyCode: FINANCE_CURRENCY_CODE,
        paymentDate,
        comment,
        createdBy: actor.id,
        createdByName: actor.name,
        createdAt: now,
        voidedAt: null,
        voidedBy: null,
        voidedByName: null,
        voidReason: null,
        idempotencyKey,
      };
      store.payments.push(payment);
      profile.updatedAt = now;
      profile.updatedBy = actor.id;
      profile.version += 1;
      await writeFinanceStore(store);
      return storeApi.getClientFinance(actor, clientExternalId);
    },

    async voidPayment(
      actor,
      clientExternalId,
      input: VoidPaymentInput,
    ) {
      const trimmed = input.reason.trim();
      if (!trimmed) {
        throw new FinanceError(
          "FINANCE_CHANGE_REASON_REQUIRED",
          "Void reason is required",
        );
      }
      const store = await readFinanceStore();
      const payment = store.payments.find(
        (p) =>
          p.id === input.paymentId && p.clientExternalId === clientExternalId,
      );
      if (!payment) {
        throw new FinanceError(
          "FINANCE_PAYMENT_NOT_FOUND",
          "Payment not found",
          404,
        );
      }
      if (payment.voidedAt) {
        throw new FinanceError(
          "FINANCE_PAYMENT_ALREADY_VOIDED",
          "Payment already voided",
          409,
        );
      }
      const now = new Date().toISOString();
      payment.voidedAt = now;
      payment.voidedBy = actor.id;
      payment.voidedByName = actor.name;
      payment.voidReason = trimmed;

      const profile = findActiveProfile(store, clientExternalId);
      if (profile) {
        profile.updatedAt = now;
        profile.updatedBy = actor.id;
        profile.version += 1;
      }
      await writeFinanceStore(store);
      return storeApi.getClientFinance(actor, clientExternalId);
    },

    async getAnalytics(
      _actor,
      query: FinanceAnalyticsQuery,
    ): Promise<FinanceAnalyticsResult> {
      const periodType = query.periodType ?? "year";
      const year = query.year ?? new Date().getFullYear();
      const month =
        periodType === "month"
          ? (query.month ?? new Date().getMonth() + 1)
          : null;

      return {
        periodType,
        year,
        month,
        direction: query.direction ?? null,
        contractsSignedCents: 0,
        newClientsCount: 0,
        receivedCents: 0,
        paymentsCount: 0,
        monthly: Array.from({ length: 12 }, (_, idx) => ({
          month: idx + 1,
          labelKey: `m${idx + 1}`,
          receivedCents: 0,
          contractsSignedCents: 0,
        })),
      };
    },
  };

  return storeApi;
}
