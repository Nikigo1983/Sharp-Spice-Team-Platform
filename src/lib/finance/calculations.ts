export type FinancePaymentStatus =
  | "no_contract"
  | "unpaid"
  | "partial"
  | "paid"
  | "overpaid";

export type ClientFinanceSummary = {
  contractAmountCents: number | null;
  paidAmountCents: number;
  balanceCents: number | null;
  overpaymentCents: number;
  paymentStatus: FinancePaymentStatus;
};

export function calculateClientFinance(
  contractAmountCents: number | null | undefined,
  paidAmountCents: number,
): ClientFinanceSummary {
  const paid = Math.max(0, Math.trunc(paidAmountCents));

  if (contractAmountCents == null) {
    return {
      contractAmountCents: null,
      paidAmountCents: paid,
      balanceCents: null,
      overpaymentCents: 0,
      paymentStatus: "no_contract",
    };
  }

  const contract = Math.trunc(contractAmountCents);
  const rawBalance = contract - paid;
  const balanceCents = Math.max(rawBalance, 0);
  const overpaymentCents = Math.max(-rawBalance, 0);

  let paymentStatus: FinancePaymentStatus;
  if (paid === 0) paymentStatus = "unpaid";
  else if (paid < contract) paymentStatus = "partial";
  else if (paid === contract) paymentStatus = "paid";
  else paymentStatus = "overpaid";

  return {
    contractAmountCents: contract,
    paidAmountCents: paid,
    balanceCents,
    overpaymentCents,
    paymentStatus,
  };
}

export function derivePaymentStatus(
  contractAmountCents: number | null | undefined,
  paidAmountCents: number,
): FinancePaymentStatus {
  return calculateClientFinance(contractAmountCents, paidAmountCents)
    .paymentStatus;
}

export type FinanceDashboardKpis = {
  totalContractsCents: number;
  totalReceivedCents: number;
  totalDebtCents: number;
  clientsWithDebt: number;
};

export function calculateDashboardKpis(
  rows: Array<{
    contractAmountCents: number | null;
    paidAmountCents: number;
  }>,
): FinanceDashboardKpis {
  let totalContractsCents = 0;
  let totalReceivedCents = 0;
  let totalDebtCents = 0;
  let clientsWithDebt = 0;

  for (const row of rows) {
    totalReceivedCents += Math.max(0, Math.trunc(row.paidAmountCents));
    if (row.contractAmountCents == null) continue;
    const summary = calculateClientFinance(
      row.contractAmountCents,
      row.paidAmountCents,
    );
    totalContractsCents += summary.contractAmountCents ?? 0;
    totalDebtCents += summary.balanceCents ?? 0;
    if ((summary.balanceCents ?? 0) > 0) clientsWithDebt += 1;
  }

  return {
    totalContractsCents,
    totalReceivedCents,
    totalDebtCents,
    clientsWithDebt,
  };
}
