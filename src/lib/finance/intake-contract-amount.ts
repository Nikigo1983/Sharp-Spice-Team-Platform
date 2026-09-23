/**
 * Bridge intake list «Сумма договора» ↔ Finance (authoritative € amounts).
 */
import "server-only";

import type { SessionUser } from "@/lib/auth/types";
import type { QuestionnaireStaffFields } from "@/lib/client-portal/staff-fields";
import { formatEuroFromCents, parseEuroToCents } from "./money";
import { canManageFinance, canViewFinance } from "./permissions";
import { readFinanceStore } from "./persistence";
import {
  changeContract,
  createOrSetContract,
  getClientFinance,
} from "./service";

/** Map questionnaire/case id → formatted EUR from active Finance profiles. */
export async function loadFinanceContractAmountLabels(): Promise<
  Map<string, string>
> {
  const map = new Map<string, string>();
  try {
    const store = await readFinanceStore();
    for (const profile of store.profiles) {
      if (profile.archivedAt || profile.contractAmountCents == null) continue;
      map.set(
        profile.clientExternalId,
        formatEuroFromCents(profile.contractAmountCents, "ru"),
      );
    }
  } catch (error) {
    console.error("[finance] load contract amounts for intake failed", error);
  }
  return map;
}

export function applyFinanceContractAmount<
  T extends { id: string; staffFields: QuestionnaireStaffFields },
>(item: T, amounts: Map<string, string>): T {
  const amount = amounts.get(item.id);
  if (!amount) return item;
  if (item.staffFields.contractAmount.trim() === amount) return item;
  return {
    ...item,
    staffFields: {
      ...item.staffFields,
      contractAmount: amount,
    },
  };
}

/**
 * When staff saves a parseable amount in the intake list, keep Finance in sync.
 * Empty/invalid values are ignored (do not clear Finance).
 */
export async function syncStaffContractAmountToFinance(
  actor: SessionUser,
  caseId: string,
  amountRaw: string | undefined,
): Promise<void> {
  if (amountRaw == null) return;
  if (!canManageFinance(actor) || !canViewFinance(actor)) return;

  const cleaned = amountRaw.trim();
  if (!cleaned) return;

  const nextCents = parseEuroToCents(cleaned);
  if (nextCents == null) return;

  try {
    const detail = await getClientFinance(actor, caseId);
    const existing = detail.profile?.contractAmountCents ?? null;
    const today = new Date().toISOString().slice(0, 10);

    if (existing == null) {
      await createOrSetContract(actor, caseId, {
        amount: nextCents,
        contractDate: detail.profile?.contractDate ?? today,
      });
      return;
    }

    if (existing === nextCents) return;

    await changeContract(actor, caseId, {
      amount: nextCents,
      reason: "Обновление суммы из списка клиентов",
    });
  } catch (error) {
    console.error("[finance] sync staff contract amount failed", {
      caseId,
      error,
    });
  }
}
