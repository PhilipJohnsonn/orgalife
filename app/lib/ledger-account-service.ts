import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  LedgerInvariantError,
  buildBalanceChangePostings,
  calculateNativeBalance,
  parseCivilDate,
  type LedgerAccountKindValue,
} from "@/app/lib/ledger";

type UserAccountKind = "ASSET" | "LIABILITY" | "RECEIVABLE" | "PAYABLE";
type AccountRegionValue = "ARGENTINA" | "AUSTRALIA" | "GLOBAL";
type AccountGroupTypeValue = "BANK" | "WALLET" | "CARD" | "OTHER";
type AccountSubtypeValue = "BANK" | "WALLET" | "CARD" | "OTHER";
type TrackingModeValue = "TRANSACTIONAL" | "DECLARED";

export type CreateAccountGroupInput = {
  name: string;
  region: AccountRegionValue;
  type: AccountGroupTypeValue;
};

export type CreateLedgerAccountInput = {
  accountGroupId: string;
  name: string;
  currency: string;
  kind: UserAccountKind;
  subtype: AccountSubtypeValue;
  trackingMode: TrackingModeValue;
  openingBalance?: string;
  openingOn?: string;
};

export type AdjustLedgerAccountInput = {
  ledgerAccountId: string;
  amount: string;
  occurredOn: string;
  reason: string;
  idempotencyKey: string;
};

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function requiredText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new LedgerInvariantError(
      "LEDGER_INVALID_DESCRIPTION",
      `${field} is required`
    );
  }
  return normalized;
}

function validateCurrency(currency: string) {
  if (!CURRENCY_PATTERN.test(currency)) {
    throw new LedgerInvariantError(
      "LEDGER_INVALID_CURRENCY",
      `Invalid currency: ${currency}`
    );
  }
}

async function ensureEquityAccount(
  transaction: Prisma.TransactionClient,
  currency: string,
  subtype: "OPENING" | "ADJUSTMENT"
) {
  const existing = await transaction.ledgerAccount.findFirst({
    where: { currency, kind: "EQUITY", subtype, isSystem: true },
  });
  if (existing) return existing;

  return transaction.ledgerAccount.create({
    data: {
      name: subtype === "OPENING" ? `Opening equity ${currency}` : `Adjustment equity ${currency}`,
      currency,
      kind: "EQUITY",
      subtype,
      trackingMode: "TRANSACTIONAL",
      isSystem: true,
    },
  });
}

function postingCreateData(
  posting: ReturnType<typeof buildBalanceChangePostings>[number]
) {
  return {
    ledgerAccountId: posting.ledgerAccountId,
    side: posting.side,
    amount: posting.amount,
  };
}

export async function createAccountGroup(input: CreateAccountGroupInput) {
  return prisma.accountGroup.create({
    data: {
      name: requiredText(input.name, "Account group name"),
      region: input.region,
      type: input.type,
    },
  });
}

export async function createLedgerAccountWithOpeningBalance(
  input: CreateLedgerAccountInput
) {
  validateCurrency(input.currency);
  const name = requiredText(input.name, "Account name");
  const openingBalance = input.openingBalance ?? "0";
  const openingIsZero = buildBalanceChangePostings({
    ledgerAccountId: "pending-account",
    accountKind: input.kind,
    equityAccountId: "pending-equity",
    currency: input.currency,
    amount: openingBalance,
  }).length === 0;
  const occurredOn = input.openingOn ? parseCivilDate(input.openingOn) : null;

  if (!openingIsZero && !occurredOn) {
    throw new LedgerInvariantError(
      "LEDGER_INVALID_DATE",
      "Opening date is required when opening balance is not zero"
    );
  }

  return prisma.$transaction(async (transaction) => {
    const account = await transaction.ledgerAccount.create({
      data: {
        accountGroupId: input.accountGroupId,
        name,
        currency: input.currency,
        kind: input.kind,
        subtype: input.subtype,
        trackingMode: input.trackingMode,
      },
    });
    if (openingIsZero) return account;

    const equity = await ensureEquityAccount(transaction, input.currency, "OPENING");
    const postings = buildBalanceChangePostings({
      ledgerAccountId: account.id,
      accountKind: input.kind,
      equityAccountId: equity.id,
      currency: input.currency,
      amount: openingBalance,
    });

    await transaction.journalEntry.create({
      data: {
        operationType: "OPENING_BALANCE",
        source: "SYSTEM",
        occurredOn: occurredOn!,
        description: `Opening balance: ${name}`,
        idempotencyKey: `opening:${account.id}`,
        postings: { create: postings.map(postingCreateData) },
      },
    });

    return account;
  });
}

export async function adjustLedgerAccount(input: AdjustLedgerAccountInput) {
  const occurredOn = parseCivilDate(input.occurredOn);
  const reason = requiredText(input.reason, "Adjustment reason");

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.journalEntry.findFirst({
      where: { source: "MANUAL", idempotencyKey: input.idempotencyKey },
      include: { postings: true },
    });
    if (existing) return existing;

    const account = await transaction.ledgerAccount.findUnique({
      where: { id: input.ledgerAccountId },
    });
    if (!account) {
      throw new LedgerInvariantError(
        "LEDGER_ACCOUNT_NOT_FOUND",
        `Ledger account not found: ${input.ledgerAccountId}`
      );
    }
    if (!account.isActive) {
      throw new LedgerInvariantError(
        "LEDGER_ACCOUNT_INACTIVE",
        `Ledger account is inactive: ${input.ledgerAccountId}`
      );
    }
    if (
      account.isSystem ||
      !["ASSET", "LIABILITY", "RECEIVABLE", "PAYABLE"].includes(account.kind)
    ) {
      throw new LedgerInvariantError(
        "LEDGER_INVALID_ACCOUNT_KIND",
        "Only user balance accounts can be adjusted"
      );
    }

    const equity = await ensureEquityAccount(
      transaction,
      account.currency.trim(),
      "ADJUSTMENT"
    );
    const postings = buildBalanceChangePostings({
      ledgerAccountId: account.id,
      accountKind: account.kind as LedgerAccountKindValue,
      equityAccountId: equity.id,
      currency: account.currency.trim(),
      amount: input.amount,
    });
    if (postings.length === 0) {
      throw new LedgerInvariantError(
        "LEDGER_INVALID_AMOUNT",
        "Adjustment amount must not be zero"
      );
    }

    return transaction.journalEntry.create({
      data: {
        operationType: "ADJUSTMENT",
        source: "MANUAL",
        occurredOn,
        description: reason,
        idempotencyKey: input.idempotencyKey,
        postings: { create: postings.map(postingCreateData) },
      },
      include: { postings: true },
    });
  });
}

export async function getNativeAccountBalances() {
  const accounts = await prisma.ledgerAccount.findMany({
    where: { isSystem: false },
    include: {
      postings: {
        select: {
          side: true,
          amount: true,
          journalEntry: { select: { status: true } },
        },
      },
    },
    orderBy: [{ accountGroupId: "asc" }, { currency: "asc" }],
  });

  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    currency: account.currency.trim(),
    kind: account.kind,
    trackingMode: account.trackingMode,
    balance: calculateNativeBalance(
      account.kind as LedgerAccountKindValue,
      account.postings.map((posting) => ({
        side: posting.side,
        amount: posting.amount.toFixed(2),
        entryStatus: posting.journalEntry.status,
      }))
    ),
  }));
}
