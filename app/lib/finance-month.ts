import { Decimal } from "@prisma/client/runtime/client";

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Civil-date bounds of a YYYY-MM month and the month before it; null when malformed. */
export function monthRange(month: string) {
  const match = MONTH_PATTERN.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  return {
    from: new Date(Date.UTC(year, index, 1)),
    to: new Date(Date.UTC(year, index + 1, 0)),
    previousFrom: new Date(Date.UTC(year, index - 1, 1)),
    previousTo: new Date(Date.UTC(year, index, 0)),
  };
}

/** Quick-capture descriptions are "Merchant — note (12.50 AUD)"; rules learn the merchant. */
export function merchantFromDescription(description: string) {
  return description.split(/ — | \(/)[0].trim();
}

/** Positive = money in for INCOME accounts, money out for EXPENSE accounts. */
export function signedFlowAmount(
  kind: "INCOME" | "EXPENSE",
  side: "DEBIT" | "CREDIT",
  amount: string
) {
  const value = new Decimal(amount);
  const positive = kind === "EXPENSE" ? side === "DEBIT" : side === "CREDIT";
  return positive ? value : value.negated();
}
