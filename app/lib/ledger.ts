import { Decimal } from "@prisma/client/runtime/client";

export type PostingSideValue = "DEBIT" | "CREDIT";

export type PostingDraft = {
  ledgerAccountId: string;
  currency: string;
  side: PostingSideValue;
  amount: string;
  categoryId?: string | null;
  statementLineId?: string | null;
};

export type NormalizedPosting = Omit<PostingDraft, "amount"> & {
  amount: Decimal;
};

export type LedgerInvariantCode =
  | "LEDGER_MIN_POSTINGS"
  | "LEDGER_INVALID_CURRENCY"
  | "LEDGER_INVALID_AMOUNT"
  | "LEDGER_INVALID_DESCRIPTION"
  | "LEDGER_INVALID_SIDE"
  | "LEDGER_UNBALANCED_CURRENCY"
  | "LEDGER_INVALID_DATE"
  | "LEDGER_ACCOUNT_NOT_FOUND"
  | "LEDGER_ACCOUNT_INACTIVE"
  | "LEDGER_ENTRY_NOT_FOUND"
  | "LEDGER_ENTRY_NOT_POSTED";

export class LedgerInvariantError extends Error {
  readonly code: LedgerInvariantCode;

  constructor(code: LedgerInvariantCode, message: string) {
    super(message);
    this.name = "LedgerInvariantError";
    this.code = code;
  }
}

const MONEY_PATTERN = /^\d{1,16}(?:\.\d{1,2})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function normalizeAmount(amount: string) {
  if (!MONEY_PATTERN.test(amount)) {
    throw new LedgerInvariantError(
      "LEDGER_INVALID_AMOUNT",
      "Amount must be a positive decimal string with at most two decimals"
    );
  }

  const decimal = new Decimal(amount);
  if (!decimal.greaterThan(0)) {
    throw new LedgerInvariantError(
      "LEDGER_INVALID_AMOUNT",
      "Amount must be greater than zero"
    );
  }

  return decimal;
}

export function validateBalancedPostings(postings: PostingDraft[]) {
  if (postings.length < 2) {
    throw new LedgerInvariantError(
      "LEDGER_MIN_POSTINGS",
      "A journal entry needs at least two postings"
    );
  }

  const totals = new Map<
    string,
    { debit: Decimal; credit: Decimal }
  >();

  const normalized = postings.map<NormalizedPosting>((posting) => {
    if (!CURRENCY_PATTERN.test(posting.currency)) {
      throw new LedgerInvariantError(
        "LEDGER_INVALID_CURRENCY",
        `Invalid currency: ${posting.currency}`
      );
    }

    if (posting.side !== "DEBIT" && posting.side !== "CREDIT") {
      throw new LedgerInvariantError(
        "LEDGER_INVALID_SIDE",
        `Invalid posting side: ${posting.side}`
      );
    }

    const amount = normalizeAmount(posting.amount);
    const total = totals.get(posting.currency) ?? {
      debit: new Decimal(0),
      credit: new Decimal(0),
    };
    total[posting.side === "DEBIT" ? "debit" : "credit"] =
      total[posting.side === "DEBIT" ? "debit" : "credit"].plus(amount);
    totals.set(posting.currency, total);

    return { ...posting, amount };
  });

  for (const [currency, total] of totals) {
    if (!total.debit.equals(total.credit)) {
      throw new LedgerInvariantError(
        "LEDGER_UNBALANCED_CURRENCY",
        `Debits and credits do not balance for ${currency}`
      );
    }
  }

  return normalized;
}

export function parseCivilDate(value: string) {
  const match = CIVIL_DATE_PATTERN.exec(value);
  if (!match) {
    throw new LedgerInvariantError(
      "LEDGER_INVALID_DATE",
      "Date must use YYYY-MM-DD"
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new LedgerInvariantError(
      "LEDGER_INVALID_DATE",
      "Date is not a valid civil date"
    );
  }

  return date;
}

export function oppositePostingSide(side: PostingSideValue) {
  return side === "DEBIT" ? "CREDIT" : "DEBIT";
}
