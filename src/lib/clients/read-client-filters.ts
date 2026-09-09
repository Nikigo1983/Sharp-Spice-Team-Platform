import type { ClientFilters } from "@/lib/google-sheets/types";

export function readClientFiltersFromSearchParams(
  searchParams: URLSearchParams,
): ClientFilters {
  const approvalStatus = searchParams.get("approvalStatus");
  const hasContract = searchParams.get("hasContract");
  return {
    search: searchParams.get("search") ?? undefined,
    direction: searchParams.get("direction") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    manager: searchParams.get("manager") ?? undefined,
    country: searchParams.get("country") ?? undefined,
    referent: searchParams.get("referent") ?? undefined,
    partner: searchParams.get("partner") ?? undefined,
    contract: searchParams.get("contract") ?? undefined,
    submittedFrom: searchParams.get("submittedFrom") ?? undefined,
    submittedTo: searchParams.get("submittedTo") ?? undefined,
    approvalStatus:
      approvalStatus === "approved" || approvalStatus === "not_approved"
        ? approvalStatus
        : undefined,
    hasContract:
      hasContract === "yes" || hasContract === "no" ? hasContract : undefined,
  };
}
