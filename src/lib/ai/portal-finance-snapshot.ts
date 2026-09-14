/**
 * Read-only finance snapshots for AI Workspace (contract amounts).
 * Source of truth: Finance store keyed by portal questionnaire id.
 */
import "server-only";

import {
  getPortalIntakeCaseById,
  listPortalIntakeCasesForAi,
  portalIntakeDisplayName,
} from "@/lib/ai/portal-intake-clients";
import { answerContractFromAnswers } from "@/lib/ai/portal-intake-fields";
import { calculateClientFinance } from "@/lib/finance/calculations";
import { formatEuroFromCents } from "@/lib/finance/money";
import { readFinanceStore } from "@/lib/finance/persistence";
import { readStaffFields } from "@/lib/client-portal/staff-fields";
import type { QuestionnaireRecord } from "@/lib/client-portal/questionnaire-types";

/** Shown to AI / managers when Finance has no contract amount yet. */
export const NO_CONTRACT_YET_LABEL = "пока нет договора";

export type PortalFinanceSnapshot = {
  clientId: string;
  name: string;
  email: string;
  /** Formatted EUR amount or null when no finance contract. */
  contractAmount: string | null;
  contractAmountCents: number | null;
  paidAmount: string | null;
  balance: string | null;
  paymentStatus: string | null;
  /** Legacy/staff «Договор» label (e.g. Flant JSC), not the money amount. */
  contractLabel: string | null;
  staffContractAmount: string | null;
};

/** Human-readable amount for tool/LLM output (never leave blank). */
export function displayContractAmount(
  amount: string | null | undefined,
): string {
  return amount?.trim() || NO_CONTRACT_YET_LABEL;
}

function findActiveProfile(
  store: Awaited<ReturnType<typeof readFinanceStore>>,
  clientExternalId: string,
) {
  return store.profiles.find(
    (p) => p.clientExternalId === clientExternalId && !p.archivedAt,
  );
}

function paidTotal(
  store: Awaited<ReturnType<typeof readFinanceStore>>,
  profileId: string,
): number {
  return store.payments
    .filter((p) => p.financeProfileId === profileId && !p.voidedAt)
    .reduce((sum, p) => sum + p.amountCents, 0);
}

export function snapshotFromRecord(
  record: QuestionnaireRecord,
  store: Awaited<ReturnType<typeof readFinanceStore>>,
): PortalFinanceSnapshot {
  const profile = findActiveProfile(store, record.id);
  const paid = profile ? paidTotal(store, profile.id) : 0;
  const summary = calculateClientFinance(
    profile?.contractAmountCents ?? null,
    paid,
  );
  const staff = readStaffFields(record.answers);
  const contractLabel = answerContractFromAnswers(record.answers) || null;
  const staffAmount = staff.contractAmount.trim() || null;

  return {
    clientId: record.id,
    name: portalIntakeDisplayName(record),
    email: record.email,
    contractAmount:
      summary.contractAmountCents != null
        ? formatEuroFromCents(summary.contractAmountCents, "ru")
        : null,
    contractAmountCents: summary.contractAmountCents,
    paidAmount:
      summary.contractAmountCents != null
        ? formatEuroFromCents(summary.paidAmountCents, "ru")
        : null,
    balance:
      summary.contractAmountCents != null
        ? formatEuroFromCents(summary.balanceCents, "ru")
        : null,
    paymentStatus:
      summary.contractAmountCents != null ? summary.paymentStatus : null,
    contractLabel,
    staffContractAmount: staffAmount,
  };
}

export async function getPortalFinanceSnapshot(
  clientId: string,
): Promise<PortalFinanceSnapshot | null> {
  const record = await getPortalIntakeCaseById(clientId);
  if (!record) return null;
  const store = await readFinanceStore();
  return snapshotFromRecord(record, store);
}

export async function listPortalFinanceSnapshots(options?: {
  onlyWithContract?: boolean;
  limit?: number;
}): Promise<{
  items: PortalFinanceSnapshot[];
  totalCases: number;
  withContract: number;
  withoutContract: number;
}> {
  const onlyWithContract = options?.onlyWithContract ?? false;
  const limit = Math.min(200, Math.max(1, options?.limit ?? 100));
  const [cases, store] = await Promise.all([
    listPortalIntakeCasesForAi(),
    readFinanceStore(),
  ]);

  const all = cases.map((record) => snapshotFromRecord(record, store));
  const withContractRows = all.filter((row) => row.contractAmountCents != null);
  const withContract = withContractRows.length;
  const withoutContract = all.length - withContract;
  const filtered = onlyWithContract ? withContractRows : all;
  const sorted = [...filtered].sort((a, b) =>
    a.name.localeCompare(b.name, "ru"),
  );

  return {
    items: sorted.slice(0, limit),
    totalCases: all.length,
    withContract,
    withoutContract,
  };
}
