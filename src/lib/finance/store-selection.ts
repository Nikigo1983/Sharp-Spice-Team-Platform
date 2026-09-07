import "server-only";

import type { FinanceStore } from "./store";

let cached: FinanceStore | null = null;

export function resetFinanceStoreCacheForTests(): void {
  cached = null;
}

/** Always use Emigrant portal questionnaires + JSON/app_state store. */
export async function getFinanceStore(): Promise<FinanceStore> {
  if (cached) return cached;
  const { createPortalFinanceStore } = await import("./portal-finance-store");
  cached = createPortalFinanceStore();
  return cached;
}
